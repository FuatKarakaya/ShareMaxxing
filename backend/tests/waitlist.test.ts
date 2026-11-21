import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Run npm test to prepare the isolated test database automatically.');
}

const HOUR = 3_600_000;
const prefix = `waitlist-test-${randomUUID()}`;
const api = request(createApp());
type Account = { id: string; token: string };

beforeAll(() => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
});

afterAll(async () => {
  try {
    const users = { email: { startsWith: prefix } };
    await prisma.waitlistEntry.deleteMany({ where: { user: users } });
    await prisma.notification.deleteMany({ where: { recipient: users } });
    await prisma.booking.deleteMany({ where: { trip: { driver: users } } });
    await prisma.trip.deleteMany({ where: { driver: users } });
    await prisma.user.deleteMany({ where: users });
  } finally {
    await prisma.$disconnect();
  }
});

async function createUser(): Promise<Account> {
  const user = await prisma.user.create({
    data: { email: `${prefix}-${randomUUID()}@itu.edu.tr`, passwordHash: 'unused', displayName: 'Test Öğrenci', emailVerifiedAt: new Date() },
  });
  return { id: user.id, token: issueAccessToken(user.id) };
}

async function createTrip(seatCapacity: number, departureInHours = 24) {
  const driver = await createUser();
  const trip = await prisma.trip.create({
    data: { driverId: driver.id, originCityCode: 34, destinationCityCode: 6, departureAt: new Date(Date.now() + departureInHours * HOUR), seatCapacity, priceMinor: 40000n },
  });
  return { id: trip.id, driver };
}

const as = (who: Account) => ({
  book: (tripId: string) => api.post('/api/bookings').auth(who.token, { type: 'bearer' }).send({ tripId }),
  cancel: (bookingId: string) => api.post(`/api/bookings/${bookingId}/cancel`).auth(who.token, { type: 'bearer' }),
  join: (tripId: unknown) => api.post('/api/waitlist').auth(who.token, { type: 'bearer' }).send({ tripId }),
  leave: (tripId: string) => api.delete(`/api/waitlist/${tripId}`).auth(who.token, { type: 'bearer' }),
  mine: () => api.get('/api/waitlist').auth(who.token, { type: 'bearer' }),
});

// A trip with one seat, taken by a passenger.
async function fullTrip() {
  const trip = await createTrip(1);
  const holder = await createUser();
  const bookingId: string = (await as(holder).book(trip.id).expect(201)).body.booking.id;
  return { trip, holder, bookingId };
}

test('waitlist endpoints require login', async () => {
  await api.get('/api/waitlist').expect(401);
  await api.post('/api/waitlist').send({ tripId: randomUUID() }).expect(401);
  await api.delete(`/api/waitlist/${randomUUID()}`).expect(401);
});

test('only a full, future trip of someone else can be joined', async () => {
  const user = await createUser();
  for (const tripId of [undefined, 'not-a-uuid']) expect((await as(user).join(tripId).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
  expect((await as(user).join(randomUUID()).expect(404)).body.error.code).toBe('TRIP_NOT_FOUND');

  const open = await createTrip(2);
  expect((await as(user).join(open.id).expect(409)).body.error.code).toBe('SEATS_AVAILABLE');

  const { trip, holder } = await fullTrip();
  expect((await as(trip.driver).join(trip.id).expect(409)).body.error.code).toBe('OWN_TRIP');
  expect((await as(holder).join(trip.id).expect(409)).body.error.code).toBe('ALREADY_BOOKED');

  const past = await createTrip(1, -1);
  expect((await as(user).join(past.id).expect(409)).body.error.code).toBe('TRIP_NOT_BOOKABLE');
});

test('people are listed in the order they joined, and joining twice shows the same place', async () => {
  const { trip } = await fullTrip();
  const [first, second] = [await createUser(), await createUser()];
  const joined = await as(first).join(trip.id).expect(201);
  expect(joined.body.entry).toMatchObject({ status: 'WAITING', position: 1, offerExpiresAt: null, trip: { id: trip.id } });
  expect((await as(second).join(trip.id).expect(201)).body.entry.position).toBe(2);
  const again = await as(second).join(trip.id).expect(200);
  expect(again.body.entry).toMatchObject({ id: expect.any(String), position: 2 });
  expect(await prisma.waitlistEntry.count({ where: { tripId: trip.id } })).toBe(2);

  const mine = await as(second).mine().expect(200);
  expect(mine.body.entries).toHaveLength(1);
  expect(mine.body.entries[0]).toMatchObject({ status: 'WAITING', position: 2 });
  expect(JSON.stringify(mine.body)).not.toMatch(/email|password|userId/);
});

test('a freed seat is held for the first person in line and nobody else can take it', async () => {
  const { trip, holder, bookingId } = await fullTrip();
  const [first, second, outsider] = [await createUser(), await createUser(), await createUser()];
  await as(first).join(trip.id).expect(201);
  await as(second).join(trip.id).expect(201);

  await as(holder).cancel(bookingId).expect(200);

  const offer = (await as(first).mine().expect(200)).body.entries[0];
  expect(offer).toMatchObject({ status: 'OFFERED', position: null });
  const hours = (new Date(offer.offerExpiresAt).getTime() - Date.now()) / HOUR;
  expect(hours).toBeGreaterThan(5.9);
  expect(hours).toBeLessThanOrEqual(6);
  expect(await prisma.notification.count({ where: { recipientId: first.id, kind: 'BOOKING', payload: { path: ['link'], equals: `/yolculuklar/${trip.id}` } } })).toBe(1);
  expect((await as(second).mine().expect(200)).body.entries[0]).toMatchObject({ status: 'WAITING', position: 1 });

  expect((await as(outsider).book(trip.id).expect(409)).body.error.code).toBe('TRIP_FULL');
  expect((await as(second).book(trip.id).expect(409)).body.error.code).toBe('TRIP_FULL');

  await as(first).book(trip.id).expect(201);
  expect(await prisma.waitlistEntry.findFirst({ where: { tripId: trip.id, userId: first.id } })).toMatchObject({ status: 'BOOKED' });
  expect((await as(first).mine().expect(200)).body.entries).toEqual([]);
});

test('the offer ends at departure if that is sooner than six hours', async () => {
  const trip = await createTrip(1, 2);
  const holder = await createUser();
  const bookingId = (await as(holder).book(trip.id).expect(201)).body.booking.id;
  const waiting = await createUser();
  await as(waiting).join(trip.id).expect(201);
  await as(holder).cancel(bookingId).expect(200);
  const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { tripId: trip.id } });
  const departure = (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).departureAt;
  expect(entry.offerExpiresAt?.getTime()).toBe(departure.getTime());
});

test('an unused offer passes to the next person in line', async () => {
  const { trip, holder, bookingId } = await fullTrip();
  const [first, second] = [await createUser(), await createUser()];
  await as(first).join(trip.id).expect(201);
  await as(second).join(trip.id).expect(201);
  await as(holder).cancel(bookingId).expect(200);

  await prisma.waitlistEntry.updateMany({ where: { tripId: trip.id, userId: first.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });

  expect((await as(second).mine().expect(200)).body.entries[0].status).toBe('OFFERED');
  expect(await prisma.waitlistEntry.findFirst({ where: { tripId: trip.id, userId: first.id } })).toMatchObject({ status: 'EXPIRED' });
  expect((await as(first).book(trip.id).expect(409)).body.error.code).toBe('TRIP_FULL');
  await as(second).book(trip.id).expect(201);
});

test('leaving the list passes a held seat on; leaving twice is refused', async () => {
  const { trip, holder, bookingId } = await fullTrip();
  const [first, second] = [await createUser(), await createUser()];
  await as(first).join(trip.id).expect(201);
  await as(second).join(trip.id).expect(201);
  await as(holder).cancel(bookingId).expect(200);

  await as(first).leave(trip.id).expect(204);
  expect((await as(first).leave(trip.id).expect(404)).body.error.code).toBe('WAITLIST_ENTRY_NOT_FOUND');
  expect((await as(second).mine().expect(200)).body.entries[0].status).toBe('OFFERED');
});

test('an unpaid reservation that runs out of time frees its seat for the waitlist', async () => {
  const { trip, bookingId } = await fullTrip();
  const waiting = await createUser();
  await as(waiting).join(trip.id).expect(201);
  await prisma.booking.update({ where: { id: bookingId }, data: { createdAt: new Date(Date.now() - 2 * HOUR), reservationExpiresAt: new Date(Date.now() - HOUR) } });
  expect((await as(waiting).mine().expect(200)).body.entries[0].status).toBe('OFFERED');
});

test('without a waitlist, a freed seat is free for everyone as before', async () => {
  const { trip, holder, bookingId } = await fullTrip();
  await as(holder).cancel(bookingId).expect(200);
  await as(await createUser()).book(trip.id).expect(201);
});

test('two people joining at the same moment get different places', async () => {
  const { trip } = await fullTrip();
  const users = await Promise.all(Array.from({ length: 5 }, createUser));
  const responses = await Promise.all(users.map(user => as(user).join(trip.id)));
  expect(responses.map(response => response.status)).toEqual([201, 201, 201, 201, 201]);
  expect(responses.map(response => response.body.entry.position).sort()).toEqual([1, 2, 3, 4, 5]);
});
