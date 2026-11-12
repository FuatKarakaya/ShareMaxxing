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
const prefix = `booking-test-${randomUUID()}`;
const api = request(createApp());

beforeAll(() => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
});

afterAll(async () => {
  try {
    const users = { email: { startsWith: prefix } };
    await prisma.booking.deleteMany({ where: { trip: { driver: users } } });
    await prisma.trip.deleteMany({ where: { driver: users } });
    await prisma.user.deleteMany({ where: users });
  } finally {
    await prisma.$disconnect();
  }
});

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@itu.edu.tr`,
      passwordHash: 'not-a-real-hash',
      displayName: 'Test Öğrenci',
      emailVerifiedAt: new Date(),
    },
  });
  return { id: user.id, token: issueAccessToken(user.id) };
}

// İstanbul (34) → Ankara (6), leaving tomorrow unless told otherwise.
async function createTrip(seatCapacity: number, extra: { departureAt?: Date; status?: 'CANCELLED' } = {}) {
  const driver = await createUser();
  const trip = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: new Date(Date.now() + 24 * HOUR),
      seatCapacity,
      priceMinor: 40000n,
      ...extra,
    },
  });
  return { id: trip.id, driver };
}

const book = (token: string, tripId: unknown) =>
  api.post('/api/bookings').set('Authorization', `Bearer ${token}`).send({ tripId });
const cancel = (token: string, bookingId: string) =>
  api.post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);
const myBookings = (token: string) => api.get('/api/bookings').set('Authorization', `Bearer ${token}`);

async function freeSeats(tripId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ free_seats: number }[]>`
    SELECT free_seats FROM trip_availability WHERE trip_id = ${tripId}::uuid`;
  return rows[0].free_seats;
}

test('booking endpoints require login', async () => {
  await api.post('/api/bookings').send({ tripId: randomUUID() }).expect(401);
  await api.get('/api/bookings').expect(401);
  await api.post(`/api/bookings/${randomUUID()}/cancel`).expect(401);
});

test('booking a seat holds it and copies the price from the trip', async () => {
  const trip = await createTrip(2);
  const passenger = await createUser();
  const response = await book(passenger.token, trip.id).expect(201);
  expect(response.body.booking).toMatchObject({
    status: 'PENDING_PAYMENT',
    priceMinor: 40000,
    paymentStatus: null,
    trip: { id: trip.id, originCity: { code: 34 }, destinationCity: { code: 6 } },
  });
  expect(await freeSeats(trip.id)).toBe(1);
});

test('rejects invalid, unknown, own, past and cancelled trips', async () => {
  const passenger = await createUser();
  for (const tripId of [undefined, 42, 'not-a-uuid']) {
    const response = await book(passenger.token, tripId).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  }
  expect((await book(passenger.token, randomUUID()).expect(404)).body.error.code).toBe('TRIP_NOT_FOUND');

  const own = await createTrip(2);
  expect((await book(own.driver.token, own.id).expect(409)).body.error.code).toBe('OWN_TRIP');

  const past = await createTrip(2, { departureAt: new Date(Date.now() - HOUR) });
  expect((await book(passenger.token, past.id).expect(409)).body.error.code).toBe('TRIP_NOT_BOOKABLE');

  const cancelled = await createTrip(2, { status: 'CANCELLED' });
  expect((await book(passenger.token, cancelled.id).expect(409)).body.error.code).toBe('TRIP_NOT_BOOKABLE');
});

test('a passenger cannot book the same trip twice', async () => {
  const trip = await createTrip(3);
  const passenger = await createUser();
  await book(passenger.token, trip.id).expect(201);
  expect((await book(passenger.token, trip.id).expect(409)).body.error.code).toBe('ALREADY_BOOKED');
  expect(await freeSeats(trip.id)).toBe(2);
});

test('a full trip cannot be booked', async () => {
  const trip = await createTrip(1);
  await book((await createUser()).token, trip.id).expect(201);
  expect((await book((await createUser()).token, trip.id).expect(409)).body.error.code).toBe('TRIP_FULL');
  expect(await freeSeats(trip.id)).toBe(0);
});

test('seat count stays correct when several people book at the same moment', async () => {
  const trip = await createTrip(2);
  const passengers = await Promise.all(Array.from({ length: 6 }, createUser));
  const responses = await Promise.all(passengers.map(passenger => book(passenger.token, trip.id)));
  const statuses = responses.map(response => response.status).sort();
  expect(statuses).toEqual([201, 201, 409, 409, 409, 409]);
  expect(await freeSeats(trip.id)).toBe(0);
});

test('cancelling a booking frees the seat for someone else', async () => {
  const trip = await createTrip(1);
  const first = await createUser();
  const second = await createUser();
  const bookingId = (await book(first.token, trip.id).expect(201)).body.booking.id;

  // Someone else's booking looks like a missing one.
  expect((await cancel(second.token, bookingId).expect(404)).body.error.code).toBe('BOOKING_NOT_FOUND');

  const response = await cancel(first.token, bookingId).expect(200);
  expect(response.body.booking.status).toBe('CANCELLED');
  expect(response.body.booking.cancelledAt).not.toBeNull();
  expect(await freeSeats(trip.id)).toBe(1);

  expect((await cancel(first.token, bookingId).expect(409)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  await book(second.token, trip.id).expect(201);
  // The freed seat is taken again, so the first passenger cannot rebook it.
  expect((await book(first.token, trip.id).expect(409)).body.error.code).toBe('TRIP_FULL');
});

test('a booking cannot be cancelled after the trip has started', async () => {
  const trip = await createTrip(1);
  const passenger = await createUser();
  const bookingId = (await book(passenger.token, trip.id).expect(201)).body.booking.id;
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
  await prisma.trip.update({ where: { id: trip.id }, data: { departureAt: new Date(Date.now() - HOUR) } });
  expect((await cancel(passenger.token, bookingId).expect(409)).body.error.code).toBe('TRIP_ALREADY_STARTED');
});

test('an unpaid reservation that ran out of time gives its seat back', async () => {
  const trip = await createTrip(1);
  const first = await createUser();
  const bookingId = (await book(first.token, trip.id).expect(201)).body.booking.id;
  await prisma.booking.update({
    where: { id: bookingId },
    data: { createdAt: new Date(Date.now() - 2 * HOUR), reservationExpiresAt: new Date(Date.now() - HOUR) },
  });

  await book((await createUser()).token, trip.id).expect(201);
  const mine = await myBookings(first.token).expect(200);
  expect(mine.body.bookings[0]).toMatchObject({ id: bookingId, status: 'EXPIRED' });
  expect((await cancel(first.token, bookingId).expect(409)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
});

test('my bookings lists only the caller\'s own bookings', async () => {
  const trip = await createTrip(3);
  const first = await createUser();
  const second = await createUser();
  const bookingId = (await book(first.token, trip.id).expect(201)).body.booking.id;
  await book(second.token, trip.id).expect(201);

  const response = await myBookings(first.token).expect(200);
  expect(response.body.bookings).toHaveLength(1);
  expect(response.body.bookings[0]).toMatchObject({
    id: bookingId,
    status: 'PENDING_PAYMENT',
    paymentStatus: null,
    trip: { id: trip.id, driver: { id: trip.driver.id, displayName: 'Test Öğrenci' } },
  });
  expect(JSON.stringify(response.body)).not.toMatch(/email|password/i);
  expect((await myBookings(trip.driver.token).expect(200)).body.bookings).toEqual([]);
});
