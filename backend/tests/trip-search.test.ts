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
const DAY = 24 * HOUR;
const prefix = `trip-search-test-${randomUUID()}`;
const api = request(createApp());

beforeAll(() => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
});

afterAll(async () => {
  try {
    const users = { email: { startsWith: prefix } };
    await prisma.rideRating.deleteMany({ where: { booking: { trip: { driver: users } } } });
    await prisma.booking.deleteMany({ where: { trip: { driver: users } } });
    await prisma.trip.deleteMany({ where: { driver: users } });
    await prisma.user.deleteMany({ where: users });
  } finally {
    await prisma.$disconnect();
  }
});

async function createUser(displayName = 'Test Öğrenci', bio: string | null = null) {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@itu.edu.tr`,
      passwordHash: 'not-a-real-hash',
      displayName,
      bio,
      emailVerifiedAt: new Date(),
    },
  });
  return { id: user.id, token: issueAccessToken(user.id) };
}

test('search and trip detail endpoints require a verified logged-in student (FR-10)', async () => {
  await api.get('/api/trips?originCityCode=34&destinationCityCode=6').expect(401);
  await api.get(`/api/trips/${randomUUID()}`).expect(401);
});

test('validates search query parameters', async () => {
  const user = await createUser();
  for (const query of [
    '',
    'originCityCode=34',
    'originCityCode=34&destinationCityCode=34',
    'originCityCode=0&destinationCityCode=34',
    'originCityCode=34&destinationCityCode=99',
    'originCityCode=34&destinationCityCode=6&date=2026-13-45',
    'originCityCode=34&destinationCityCode=6&unknown=1',
  ]) {
    const res = await api.get(`/api/trips?${query}`).set('Authorization', `Bearer ${user.token}`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  }
});

test('lists matching published future trips with free-seat trips first and full trips after them (FR-11)', async () => {
  const driver = await createUser('Sürücü Elif');
  const passenger1 = await createUser();
  const passenger2 = await createUser();
  const searcher = await createUser();

  // Use a specific future date so test trips are isolated by the date filter.
  const targetDay = new Date(Date.now() + 20 * DAY);
  const dateStr = targetDay.toISOString().slice(0, 10);
  const morning = new Date(`${dateStr}T08:00:00.000Z`);
  const noon = new Date(`${dateStr}T12:00:00.000Z`);
  const evening = new Date(`${dateStr}T18:00:00.000Z`);

  // 1. Morning trip: capacity 1, FULL (1 CONFIRMED booking) — leaves earliest, but must appear AFTER free-seat trips.
  const fullMorning = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: morning,
      seatCapacity: 1,
      priceMinor: 40000n,
    },
  });
  await prisma.booking.create({
    data: {
      tripId: fullMorning.id,
      passengerId: passenger1.id,
      priceMinor: 40000n,
      status: 'CONFIRMED',
      reservationExpiresAt: new Date(Date.now() + HOUR),
    },
  });

  // 2. Evening trip: capacity 2, 2 free seats.
  const freeEvening = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: evening,
      seatCapacity: 2,
      priceMinor: 50000n,
    },
  });

  // 3. Noon trip: capacity 1, has an EXPIRED PENDING_PAYMENT hold — must be freed and appear FIRST among free trips.
  const expiredHoldNoon = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: noon,
      seatCapacity: 1,
      priceMinor: 45000n,
    },
  });
  await prisma.booking.create({
    data: {
      tripId: expiredHoldNoon.id,
      passengerId: passenger2.id,
      priceMinor: 45000n,
      status: 'PENDING_PAYMENT',
      createdAt: new Date(Date.now() - 2 * HOUR),
      reservationExpiresAt: new Date(Date.now() - HOUR),
    },
  });

  // 4. Cancelled trip and different-route trip on the same day — must NOT appear.
  await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: noon,
      seatCapacity: 3,
      priceMinor: 40000n,
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });
  await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 35,
      departureAt: noon,
      seatCapacity: 3,
      priceMinor: 40000n,
    },
  });

  const res = await api
    .get(`/api/trips?originCityCode=34&destinationCityCode=6&date=${dateStr}`)
    .set('Authorization', `Bearer ${searcher.token}`)
    .expect(200);

  expect(res.body.trips.map((t: { id: string }) => t.id)).toEqual([
    expiredHoldNoon.id,
    freeEvening.id,
    fullMorning.id,
  ]);
  expect(res.body.trips[0]).toMatchObject({ id: expiredHoldNoon.id, freeSeats: 1, isFull: false });
  expect(res.body.trips[1]).toMatchObject({ id: freeEvening.id, freeSeats: 2, isFull: false });
  expect(res.body.trips[2]).toMatchObject({ id: fullMorning.id, freeSeats: 0, isFull: true });
});

test('trip detail returns trip info, contact details, and only two-way revealed driver ratings (FR-12, FR-28)', async () => {
  const driver = await createUser('Mert Sürücü', 'İTÜ Elektrik Mühendisliği');
  const passengerRevealed = await createUser();
  const passengerHidden = await createUser();
  const viewer = await createUser();

  const pastTrip = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 35,
      departureAt: new Date(Date.now() - 2 * DAY),
      seatCapacity: 2,
      priceMinor: 50000n,
      status: 'COMPLETED',
      driverCompletedAt: new Date(Date.now() - DAY),
    },
  });

  const completedBooking1 = await prisma.booking.create({
    data: {
      tripId: pastTrip.id,
      passengerId: passengerRevealed.id,
      priceMinor: 50000n,
      status: 'COMPLETED',
      createdAt: new Date(Date.now() - 4 * DAY),
      reservationExpiresAt: new Date(Date.now() - 3 * DAY),
      passengerCompletedAt: new Date(Date.now() - DAY),
      completedAt: new Date(Date.now() - DAY),
    },
  });

  // Both sides rated on completedBooking1 -> revealed!
  await prisma.rideRating.createMany({
    data: [
      {
        bookingId: completedBooking1.id,
        direction: 'PASSENGER_TO_DRIVER',
        score: 5,
        review: 'Harika yolculuktu.',
      },
      {
        bookingId: completedBooking1.id,
        direction: 'DRIVER_TO_PASSENGER',
        score: 5,
        review: 'Teşekkürler.',
      },
    ],
  });

  const completedBooking2 = await prisma.booking.create({
    data: {
      tripId: pastTrip.id,
      passengerId: passengerHidden.id,
      priceMinor: 50000n,
      status: 'COMPLETED',
      createdAt: new Date(Date.now() - 4 * DAY),
      reservationExpiresAt: new Date(Date.now() - 3 * DAY),
      passengerCompletedAt: new Date(Date.now() - DAY),
      completedAt: new Date(Date.now() - DAY),
    },
  });

  // Only passenger rated on completedBooking2 -> must remain hidden!
  await prisma.rideRating.create({
    data: {
      bookingId: completedBooking2.id,
      direction: 'PASSENGER_TO_DRIVER',
      score: 1,
      review: 'Tek taraflı gizli puan',
    },
  });

  const upcomingTrip = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: new Date(Date.now() + 3 * DAY),
      seatCapacity: 3,
      priceMinor: 40000n,
      description: 'Maslak çıkışlı',
      contactDetails: '0555 999 88 77',
    },
  });

  const detail = await api
    .get(`/api/trips/${upcomingTrip.id}`)
    .set('Authorization', `Bearer ${viewer.token}`)
    .expect(200);

  expect(detail.body.trip).toMatchObject({
    id: upcomingTrip.id,
    freeSeats: 3,
    isFull: false,
    priceMinor: 40000,
    description: 'Maslak çıkışlı',
    contactDetails: '0555 999 88 77',
    driver: {
      id: driver.id,
      displayName: 'Mert Sürücü',
      bio: 'İTÜ Elektrik Mühendisliği',
      ratingSummary: {
        averageScore: 5,
        ratingCount: 1,
      },
      ratings: [
        {
          score: 5,
          review: 'Harika yolculuktu.',
        },
      ],
    },
  });
  expect(JSON.stringify(detail.body)).not.toMatch(/Tek taraflı gizli puan|email|password/i);

  const missing = await api
    .get(`/api/trips/${randomUUID()}`)
    .set('Authorization', `Bearer ${viewer.token}`)
    .expect(404);
  expect(missing.body.error.code).toBe('TRIP_NOT_FOUND');
});
