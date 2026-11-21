import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const url = process.env.TEST_DATABASE_URL;
if (!url || url !== process.env.DATABASE_URL || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');
const prefix = `profile-${randomUUID()}`;
const api = request(app);
let driver: string;
let passenger: string;
let funded: string;
let token: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'profile-test-secret-at-least-32-characters';
  const user = (name: string) => prisma.user.create({ data: {
    email: `${prefix}-${name}@itu.edu.tr`, displayName: name, emailVerifiedAt: new Date(), passwordHash: 'unused',
  } });
  [driver, passenger, funded] = (await Promise.all(['driver', 'passenger', 'funded'].map(user))).map(u => u.id);
  token = issueAccessToken(driver);
});

afterAll(async () => {
  const users = { email: { startsWith: prefix } };
  try {
    await prisma.rideRating.deleteMany({ where: { booking: { passenger: users } } });
    await prisma.booking.deleteMany({ where: { passenger: users } });
    await prisma.sponsorshipRequest.deleteMany({ where: { recipient: users } });
    await prisma.trip.deleteMany({ where: { driver: users } });
    await prisma.user.deleteMany({ where: users });
  } finally { await prisma.$disconnect(); }
});

const read = (id: string) => api.get(`/api/profiles/${id}`).auth(token, { type: 'bearer' });
const edit = (body: object) => api.patch('/api/profiles/me').auth(token, { type: 'bearer' }).send(body);

test('only a verified student can read profiles and edit their own display fields', async () => {
  await api.get(`/api/profiles/${driver}`).expect(401);
  await api.patch('/api/profiles/me').send({ bio: 'x' }).expect(401);
  await edit({ bio: ' hello ', displayName: ' Ada ' }).expect(200);
  for (const body of [{}, { bio: 1 }, { bio: 'x'.repeat(501) }, { displayName: ' ' },
    { id: passenger, displayName: 'Other' }, { role: 'ADMIN' }]) await edit(body).expect(400);
  expect((await read(driver).expect(200)).body.profile).toMatchObject({ bio: 'hello', displayName: 'Ada' });
  await api.patch(`/api/profiles/${passenger}`).auth(token, { type: 'bearer' }).send({ bio: 'x' }).expect(404);
  expect((await edit({ bio: null }).expect(200)).body.profile.bio).toBeNull();
  await read('bad-id').expect(400);
  await read(randomUUID()).expect(404);
  await prisma.user.update({ where: { id: passenger }, data: { emailVerifiedAt: null } });
  try {
    await read(passenger).expect(404);
    await api.get(`/api/profiles/${driver}`).auth(issueAccessToken(passenger), { type: 'bearer' }).expect(403);
  } finally { await prisma.user.update({ where: { id: passenger }, data: { emailVerifiedAt: new Date() } }); }
});

test('public history counts trips and discloses only received, revealed ratings', async () => {
  const now = new Date();
  const later = new Date(Date.now() + 86400000);
  const trip = await prisma.trip.create({ data: { driverId: driver, originCityCode: 34, destinationCityCode: 6,
    seatCapacity: 2, priceMinor: 500, departureAt: now, status: 'COMPLETED', driverCompletedAt: now } });
  const funding = await prisma.sponsorshipRequest.create({ data: { tripId: trip.id, recipientId: funded,
    amountMinor: 500, expiresAt: later, status: 'FUNDED' } });
  const booking = (passengerId: string, sponsorshipRequestId?: string) => prisma.booking.create({ data: {
    passengerId, tripId: trip.id, sponsorshipRequestId, status: 'COMPLETED', completedAt: now,
    passengerCompletedAt: now, priceMinor: 500, reservationExpiresAt: later,
  } });
  const ordinary = await booking(passenger);
  const sponsored = await booking(funded, funding.id);
  await prisma.rideRating.createMany({ data: [ordinary, sponsored].map(b => ({
    bookingId: b.id, direction: 'PASSENGER_TO_DRIVER' as const, score: 4, review: 'Yorum',
  })) });
  expect((await read(driver)).body.profile).toMatchObject({ ridesAsDriver: 1, ratingCount: 0, averageRating: null, recentRatings: [] });
  await prisma.rideRating.create({ data: { bookingId: ordinary.id, direction: 'DRIVER_TO_PASSENGER', score: 5 } });
  expect((await read(driver)).body.profile).toMatchObject({ ratingCount: 1, averageRating: 4, recentRatings: [{ score: 4, review: 'Yorum' }] });
  expect((await read(passenger)).body.profile).toMatchObject({ ridesAsPassenger: 1, ratingCount: 1, averageRating: 5 });
  expect((await read(funded)).body.profile).toEqual({ id: funded, displayName: 'funded', bio: null,
    ridesAsDriver: 0, ridesAsPassenger: 1, ratingCount: 0, averageRating: null, recentRatings: [] });
});
