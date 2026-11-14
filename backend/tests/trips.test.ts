import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Run npm test to prepare the isolated test database automatically.');
}

const HOUR = 60 * 60 * 1000;
const prefix = `trip-test-${randomUUID()}`;
const api = request(createApp());

beforeAll(() => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
});

afterAll(async () => {
  try {
    const users = { email: { startsWith: prefix } };
    await prisma.booking.deleteMany({ where: { trip: { driver: users } } });
    await prisma.sponsorshipRequest.deleteMany({ where: { trip: { driver: users } } });
    await prisma.trip.deleteMany({ where: { driver: users } });
    await prisma.user.deleteMany({ where: users });
  } finally {
    await prisma.$disconnect();
  }
});

async function createUser(displayName = 'Test Sürücü') {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@itu.edu.tr`,
      passwordHash: 'not-a-real-hash',
      displayName,
      emailVerifiedAt: new Date(),
    },
  });
  return { id: user.id, token: issueAccessToken(user.id) };
}

function validTripPayload(overrides: Record<string, unknown> = {}) {
  return {
    originCityCode: 34,
    destinationCityCode: 6,
    departureAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    seatCapacity: 3,
    priceMinor: 45000,
    description: '  Ayazağa çıkışlı, 1 orta boy valiz uygun.  ',
    contactDetails: '  0555 123 45 67  ',
    ...overrides,
  };
}

const postTrip = (token: string, body: unknown) =>
  api.post('/api/trips').set('Authorization', `Bearer ${token}`).send(body as object);
const patchTrip = (token: string, tripId: string, body: unknown) =>
  api.patch(`/api/trips/${tripId}`).set('Authorization', `Bearer ${token}`).send(body as object);
const cancelTripReq = (token: string, tripId: string) =>
  api.post(`/api/trips/${tripId}/cancel`).set('Authorization', `Bearer ${token}`);
const myTrips = (token: string) =>
  api.get('/api/trips/mine').set('Authorization', `Bearer ${token}`);

test('trip and city endpoints require authentication', async () => {
  await api.get('/api/cities').expect(401);
  await api.post('/api/trips').send(validTripPayload()).expect(401);
  await api.get('/api/trips/mine').expect(401);
  await api.patch(`/api/trips/${randomUUID()}`).send({ seatCapacity: 4 }).expect(401);
  await api.post(`/api/trips/${randomUUID()}/cancel`).expect(401);
});

test('GET /api/cities returns all 81 Turkish provinces including İstanbul and Ankara', async () => {
  const user = await createUser();
  const { body } = await api.get('/api/cities').set('Authorization', `Bearer ${user.token}`).expect(200);
  expect(body.cities).toHaveLength(81);
  expect(body.cities).toEqual(
    expect.arrayContaining([
      { code: 6, name: 'Ankara' },
      { code: 34, name: 'İstanbul' },
      { code: 35, name: 'İzmir' },
    ]),
  );
});

test('creates trips starting or ending in İstanbul with trimmed optional fields and no private user leaks', async () => {
  const driver = await createUser('Mert Sürücü');

  const fromIstanbul = await postTrip(driver.token, validTripPayload()).expect(201);
  expect(fromIstanbul.body.trip).toMatchObject({
    status: 'PUBLISHED',
    seatCapacity: 3,
    occupiedSeats: 0,
    freeSeats: 3,
    isFull: false,
    priceMinor: 45000,
    description: 'Ayazağa çıkışlı, 1 orta boy valiz uygun.',
    contactDetails: '0555 123 45 67',
    originCity: { code: 34, name: 'İstanbul' },
    destinationCity: { code: 6, name: 'Ankara' },
    driver: { id: driver.id, displayName: 'Mert Sürücü' },
  });
  expect(JSON.stringify(fromIstanbul.body)).not.toMatch(/email|password/i);

  const toIstanbul = await postTrip(
    driver.token,
    validTripPayload({
      originCityCode: 35,
      destinationCityCode: 34,
      description: '   ',
      contactDetails: null,
    }),
  ).expect(201);
  expect(toIstanbul.body.trip).toMatchObject({
    originCity: { code: 35, name: 'İzmir' },
    destinationCity: { code: 34, name: 'İstanbul' },
    description: null,
    contactDetails: null,
  });
});

test('rejects non-İstanbul routes, same-city routes, past departures, and malformed inputs (FR-08)', async () => {
  const driver = await createUser();

  const nonIstanbul = await postTrip(driver.token, validTripPayload({ originCityCode: 6, destinationCityCode: 35 })).expect(400);
  expect(nonIstanbul.body.error.code).toBe('VALIDATION_ERROR');

  const sameCity = await postTrip(driver.token, validTripPayload({ originCityCode: 34, destinationCityCode: 34 })).expect(400);
  expect(sameCity.body.error.code).toBe('VALIDATION_ERROR');

  const pastDeparture = await postTrip(
    driver.token,
    validTripPayload({ departureAt: new Date(Date.now() - HOUR).toISOString() }),
  ).expect(400);
  expect(pastDeparture.body.error.code).toBe('VALIDATION_ERROR');

  for (const invalid of [
    { originCityCode: 0 },
    { destinationCityCode: 82 },
    { seatCapacity: 0 },
    { seatCapacity: 51 },
    { priceMinor: 0 },
    { priceMinor: -500 },
    { contactDetails: 'x'.repeat(251) },
    { extraField: 'not-allowed' },
  ]) {
    const res = await postTrip(driver.token, validTripPayload(invalid)).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  }
});

test('GET /api/trips/mine lists only the caller\'s trips and expires stale holds first', async () => {
  const driver1 = await createUser();
  const driver2 = await createUser();
  const passenger = await createUser();

  const tripRes = await postTrip(driver1.token, validTripPayload({ seatCapacity: 2 })).expect(201);
  const tripId = tripRes.body.trip.id as string;
  await postTrip(driver2.token, validTripPayload()).expect(201);

  // Create an already-expired PENDING_PAYMENT booking on driver1's trip.
  await prisma.booking.create({
    data: {
      tripId,
      passengerId: passenger.id,
      priceMinor: 45000n,
      status: 'PENDING_PAYMENT',
      createdAt: new Date(Date.now() - 2 * HOUR),
      reservationExpiresAt: new Date(Date.now() - HOUR),
    },
  });

  const mine = await myTrips(driver1.token).expect(200);
  expect(mine.body.trips).toHaveLength(1);
  expect(mine.body.trips[0]).toMatchObject({
    id: tripId,
    seatCapacity: 2,
    occupiedSeats: 0,
    freeSeats: 2,
    isFull: false,
  });
});

test('driver can edit route, departure, price, capacity and details before any booking or request', async () => {
  const driver = await createUser();
  const other = await createUser();
  const created = await postTrip(driver.token, validTripPayload({ seatCapacity: 2, priceMinor: 30000 })).expect(201);
  const tripId = created.body.trip.id as string;

  expect((await patchTrip(other.token, tripId, { seatCapacity: 4 }).expect(403)).body.error.code).toBe('FORBIDDEN');

  const newDeparture = new Date(Date.now() + 48 * HOUR).toISOString();
  const updated = await patchTrip(driver.token, tripId, {
    originCityCode: 16,
    destinationCityCode: 34,
    departureAt: newDeparture,
    seatCapacity: 4,
    priceMinor: 35000,
    description: 'Bursa - İstanbul güncellendi',
    contactDetails: 'Yeni iletişim',
  }).expect(200);

  expect(updated.body.trip).toMatchObject({
    id: tripId,
    originCity: { code: 16, name: 'Bursa' },
    destinationCity: { code: 34, name: 'İstanbul' },
    seatCapacity: 4,
    freeSeats: 4,
    priceMinor: 35000,
    description: 'Bursa - İstanbul güncellendi',
    contactDetails: 'Yeni iletişim',
  });
});

test('freezes route, departure and price after a live booking or request, and protects occupied capacity', async () => {
  const driver = await createUser();
  const passenger1 = await createUser();
  const passenger2 = await createUser();

  const created = await postTrip(driver.token, validTripPayload({ seatCapacity: 3, priceMinor: 40000 })).expect(201);
  const tripId = created.body.trip.id as string;

  await prisma.booking.create({
    data: {
      tripId,
      passengerId: passenger1.id,
      priceMinor: 40000n,
      status: 'CONFIRMED',
      reservationExpiresAt: new Date(Date.now() + HOUR),
    },
  });
  await prisma.booking.create({
    data: {
      tripId,
      passengerId: passenger2.id,
      priceMinor: 40000n,
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: new Date(Date.now() + HOUR),
    },
  });

  for (const frozenPatch of [
    { destinationCityCode: 35 },
    { priceMinor: 50000 },
    { departureAt: new Date(Date.now() + 72 * HOUR).toISOString() },
  ]) {
    const res = await patchTrip(driver.token, tripId, frozenPatch).expect(409);
    expect(res.body.error.code).toBe('TRIP_FIELDS_FROZEN');
  }

  // Cannot drop capacity below the 2 occupied seats.
  const capErr = await patchTrip(driver.token, tripId, { seatCapacity: 1 }).expect(409);
  expect(capErr.body.error.code).toBe('CAPACITY_BELOW_OCCUPIED');

  // Can update description, contactDetails, and set capacity to 2 (equal to occupied seats).
  const allowed = await patchTrip(driver.token, tripId, {
    seatCapacity: 2,
    description: 'Son koltuklar doldu',
    contactDetails: '0532 000 00 00',
  }).expect(200);
  expect(allowed.body.trip).toMatchObject({
    seatCapacity: 2,
    occupiedSeats: 2,
    freeSeats: 0,
    isFull: true,
    description: 'Son koltuklar doldu',
    contactDetails: '0532 000 00 00',
  });
});

test('cancelling a trip cancels active bookings and open sponsorship requests (FR-09)', async () => {
  const driver = await createUser();
  const other = await createUser();
  const passenger = await createUser();
  const requester = await createUser();

  const created = await postTrip(driver.token, validTripPayload({ seatCapacity: 2 })).expect(201);
  const tripId = created.body.trip.id as string;

  const booking = await prisma.booking.create({
    data: {
      tripId,
      passengerId: passenger.id,
      priceMinor: 45000n,
      status: 'CONFIRMED',
      reservationExpiresAt: new Date(Date.now() + HOUR),
    },
  });
  const sponsorship = await prisma.sponsorshipRequest.create({
    data: {
      tripId,
      recipientId: requester.id,
      amountMinor: 45000n,
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 12 * HOUR),
    },
  });

  expect((await cancelTripReq(other.token, tripId).expect(403)).body.error.code).toBe('FORBIDDEN');

  const cancelled = await cancelTripReq(driver.token, tripId).expect(200);
  expect(cancelled.body.trip.status).toBe('CANCELLED');
  expect(cancelled.body.trip.cancelledAt).not.toBeNull();

  const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  expect(updatedBooking.status).toBe('CANCELLED');
  expect(updatedBooking.cancelledAt).not.toBeNull();

  const updatedSponsorship = await prisma.sponsorshipRequest.findUniqueOrThrow({ where: { id: sponsorship.id } });
  expect(updatedSponsorship.status).toBe('CANCELLED');

  // Cannot cancel or edit an already-cancelled trip.
  expect((await cancelTripReq(driver.token, tripId).expect(409)).body.error.code).toBe('TRIP_NOT_CANCELLABLE');
  expect((await patchTrip(driver.token, tripId, { description: 'Deneme' }).expect(409)).body.error.code).toBe(
    'TRIP_NOT_EDITABLE',
  );
});
