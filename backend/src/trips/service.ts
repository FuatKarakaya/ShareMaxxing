import { Prisma, type BookingStatus, type SponsorshipStatus } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  validateCreateTrip,
  validateRouteCities,
  validateSearchTripsQuery,
  validateUpdateTrip,
} from './validation';

// Bookings that occupy a seat (matches trip_availability view and WBS-7.1).
const SEAT_HOLDING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'];

// Sponsorship requests considered live for trip freeze rules (databaseplan.md 3 & 4.3).
const LIVE_SPONSORSHIP_STATUSES: SponsorshipStatus[] = ['OPEN', 'FUNDING', 'FUNDED'];

const tripSelect = {
  id: true,
  status: true,
  departureAt: true,
  seatCapacity: true,
  priceMinor: true,
  description: true,
  contactDetails: true,
  driverCompletedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  originCity: { select: { code: true, name: true } },
  destinationCity: { select: { code: true, name: true } },
  driver: { select: { id: true, displayName: true } },
  _count: {
    select: {
      bookings: {
        where: { status: { in: SEAT_HOLDING_STATUSES } },
      },
    },
  },
} satisfies Prisma.TripSelect;

type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>;

function toTripResponse(row: TripRow) {
  const { _count, priceMinor, ...trip } = row;
  const occupiedSeats = _count.bookings;
  const freeSeats = Math.max(0, trip.seatCapacity - occupiedSeats);
  return {
    ...trip,
    priceMinor: Number(priceMinor),
    occupiedSeats,
    freeSeats,
    isFull: freeSeats === 0,
  };
}

type Tx = Prisma.TransactionClient;

async function lockTrip(tx: Tx, tripId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
  if (!rows.length) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Yolculuk bulunamadı.');
  }
  return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
}

async function expireStaleHoldsAndRequests(tx: Tx, tripId: string, now: Date) {
  await tx.booking.updateMany({
    where: { tripId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  await tx.sponsorshipRequest.updateMany({
    where: { tripId, status: 'OPEN', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
}

export async function listCities() {
  return prisma.city.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, name: true },
  });
}

export async function createTrip(driverId: string, rawBody: unknown) {
  const now = new Date();
  const input = validateCreateTrip(rawBody, now);

  const row = await prisma.trip.create({
    data: {
      driverId,
      originCityCode: input.originCityCode,
      destinationCityCode: input.destinationCityCode,
      departureAt: input.departureAt,
      seatCapacity: input.seatCapacity,
      priceMinor: input.priceMinor,
      description: input.description,
      contactDetails: input.contactDetails,
    },
    select: tripSelect,
  });

  return toTripResponse(row);
}

export async function listMyTrips(driverId: string) {
  const now = new Date();
  await prisma.booking.updateMany({
    where: {
      trip: { driverId },
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  });

  const rows = await prisma.trip.findMany({
    where: { driverId },
    orderBy: [{ departureAt: 'desc' }, { createdAt: 'desc' }],
    select: tripSelect,
  });

  return rows.map(toTripResponse);
}

export async function updateTrip(driverId: string, tripId: string, rawBody: unknown) {
  const now = new Date();
  const patch = validateUpdateTrip(rawBody, now);

  const row = await prisma.$transaction(async tx => {
    const trip = await lockTrip(tx, tripId);
    if (trip.driverId !== driverId) {
      throw new ApiError(403, 'FORBIDDEN', 'Bu yolculuğu yalnızca sürücüsü düzenleyebilir.');
    }
    if (trip.status !== 'PUBLISHED' || trip.departureAt <= now) {
      throw new ApiError(409, 'TRIP_NOT_EDITABLE', 'Yalnızca gelecekteki yayında olan yolculuklar düzenlenebilir.');
    }

    await expireStaleHoldsAndRequests(tx, tripId, now);

    const nextOrigin = patch.originCityCode ?? trip.originCityCode;
    const nextDestination = patch.destinationCityCode ?? trip.destinationCityCode;
    validateRouteCities(nextOrigin, nextDestination);

    const occupiedSeats = await tx.booking.count({
      where: { tripId, status: { in: SEAT_HOLDING_STATUSES } },
    });
    const liveRequests = await tx.sponsorshipRequest.count({
      where: { tripId, status: { in: LIVE_SPONSORSHIP_STATUSES } },
    });

    const routeOrPriceOrDepartureChanged =
      (patch.originCityCode !== undefined && patch.originCityCode !== trip.originCityCode) ||
      (patch.destinationCityCode !== undefined && patch.destinationCityCode !== trip.destinationCityCode) ||
      (patch.departureAt !== undefined && patch.departureAt.getTime() !== trip.departureAt.getTime()) ||
      (patch.priceMinor !== undefined && patch.priceMinor !== trip.priceMinor);

    if (routeOrPriceOrDepartureChanged && (occupiedSeats > 0 || liveRequests > 0)) {
      throw new ApiError(
        409,
        'TRIP_FIELDS_FROZEN',
        'Aktif rezervasyon veya askıda bilet talebi olan yolculukların güzergahı, kalkış zamanı ve fiyatı değiştirilemez.',
      );
    }

    if (patch.seatCapacity !== undefined && patch.seatCapacity < occupiedSeats) {
      throw new ApiError(
        409,
        'CAPACITY_BELOW_OCCUPIED',
        'Koltuk kapasitesi mevcut dolu koltuk sayısının altına düşürülemez.',
      );
    }

    return tx.trip.update({
      where: { id: tripId },
      data: {
        originCityCode: patch.originCityCode,
        destinationCityCode: patch.destinationCityCode,
        departureAt: patch.departureAt,
        seatCapacity: patch.seatCapacity,
        priceMinor: patch.priceMinor,
        description: patch.description,
        contactDetails: patch.contactDetails,
      },
      select: tripSelect,
    });
  });

  return toTripResponse(row);
}

export async function cancelTrip(driverId: string, tripId: string) {
  const row = await prisma.$transaction(async tx => {
    const trip = await lockTrip(tx, tripId);
    if (trip.driverId !== driverId) {
      throw new ApiError(403, 'FORBIDDEN', 'Bu yolculuğu yalnızca sürücüsü iptal edebilir.');
    }
    if (trip.status !== 'PUBLISHED') {
      throw new ApiError(409, 'TRIP_NOT_CANCELLABLE', 'Bu yolculuk iptal edilemez.');
    }
    const now = new Date();
    if (trip.departureAt <= now) {
      throw new ApiError(409, 'TRIP_ALREADY_STARTED', 'Yolculuk başladıktan sonra iptal edilemez.');
    }

    await expireStaleHoldsAndRequests(tx, tripId, now);

    // Cancel all active passenger bookings and open/funding askıda bilet requests on this trip (FR-09).
    // TODO(WBS-11.1): trigger refunds for CONFIRMED bookings with HELD payments and send cancellation notifications (WBS-22.2).
    await tx.booking.updateMany({
      where: { tripId, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await tx.sponsorshipRequest.updateMany({
      where: { tripId, status: { in: ['OPEN', 'FUNDING'] } },
      data: { status: 'CANCELLED' },
    });

    return tx.trip.update({
      where: { id: tripId },
      data: { status: 'CANCELLED', cancelledAt: now },
      select: tripSelect,
    });
  });

  return toTripResponse(row);
}

export async function searchTrips(rawQuery: unknown) {
  const query = validateSearchTripsQuery(rawQuery);
  const now = new Date();

  // Expire any stale PENDING_PAYMENT reservations on matching published trips so seat counts are exact.
  await prisma.booking.updateMany({
    where: {
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: { lte: now },
      trip: {
        originCityCode: query.originCityCode,
        destinationCityCode: query.destinationCityCode,
        status: 'PUBLISHED',
      },
    },
    data: { status: 'EXPIRED' },
  });

  const departureFilter: Prisma.DateTimeFilter = {
    gt: query.dateStart && query.dateStart > now ? query.dateStart : now,
    ...(query.dateStart ? { gte: query.dateStart > now ? query.dateStart : now } : {}),
    ...(query.dateEnd ? { lte: query.dateEnd } : {}),
  };

  const rows = await prisma.trip.findMany({
    where: {
      originCityCode: query.originCityCode,
      destinationCityCode: query.destinationCityCode,
      status: 'PUBLISHED',
      departureAt: departureFilter,
    },
    orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
    select: tripSelect,
  });

  const mapped = rows.map(toTripResponse);

  // Order trips with free seats first (freeSeats > 0), full trips after them, then by departureAt ASC, id ASC (FR-11, databaseplan.md 4.10).
  mapped.sort((a, b) => {
    if (a.isFull !== b.isFull) {
      return a.isFull ? 1 : -1;
    }
    const timeDiff = a.departureAt.getTime() - b.departureAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  return mapped;
}

interface RevealedDriverRatingRow {
  score: number;
  review: string | null;
  createdAt: Date;
}

export async function getTripDetail(tripId: string) {
  const now = new Date();

  await prisma.booking.updateMany({
    where: {
      tripId,
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  });

  const row = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      ...tripSelect,
      driver: {
        select: {
          id: true,
          displayName: true,
          bio: true,
        },
      },
    },
  });

  if (!row) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Yolculuk bulunamadı.');
  }

  // Only two-way revealed ratings (revealed_ride_ratings view, direction PASSENGER_TO_DRIVER) are visible (FR-12, FR-28).
  const ratings = await prisma.$queryRaw<RevealedDriverRatingRow[]>`
    SELECT r.score::int AS score, r.review, r.created_at AS "createdAt"
    FROM revealed_ride_ratings r
    JOIN bookings b ON b.id = r.booking_id
    JOIN trips t ON t.id = b.trip_id
    WHERE t.driver_id = ${row.driver.id}::uuid
      AND r.direction = 'PASSENGER_TO_DRIVER'
    ORDER BY r.created_at DESC
  `;

  const ratingCount = ratings.length;
  const averageScore =
    ratingCount > 0
      ? Number((ratings.reduce((sum, item) => sum + item.score, 0) / ratingCount).toFixed(2))
      : null;

  const base = toTripResponse(row);
  return {
    ...base,
    driver: {
      id: row.driver.id,
      displayName: row.driver.displayName,
      bio: row.driver.bio,
      ratingSummary: {
        averageScore,
        ratingCount,
      },
      ratings,
    },
  };
}
