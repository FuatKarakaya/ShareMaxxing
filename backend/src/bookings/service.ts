import { Prisma, type BookingStatus } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

// A PENDING_PAYMENT booking holds its seat this long while the passenger pays (database plan 4.2).
const RESERVATION_MINUTES = 15;

// These bookings occupy a seat. Same list as the trip_availability view.
const SEAT_HOLDING: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'];

const bookingSelect = {
  id: true,
  status: true,
  priceMinor: true,
  reservationExpiresAt: true,
  cancelledAt: true,
  createdAt: true,
  trip: {
    select: {
      id: true,
      departureAt: true,
      status: true,
      originCity: { select: { code: true, name: true } },
      destinationCity: { select: { code: true, name: true } },
      driver: { select: { id: true, displayName: true } },
    },
  },
  payments: {
    where: { status: { not: 'FAILED' } },
    select: { status: true },
  },
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

function toResponse(row: BookingRow) {
  const { payments, priceMinor, ...booking } = row;
  return {
    ...booking,
    // Money is integer kuruş. It is far below 2^53, so a JSON number is safe.
    priceMinor: Number(priceMinor),
    paymentStatus: payments[0]?.status ?? null,
  };
}

type Tx = Prisma.TransactionClient;

// Locks the trip row. Booking, cancelling and expiring all take this lock,
// so two requests for the same trip never count seats at the same time.
async function lockTrip(tx: Tx, tripId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, 'TRIP_NOT_FOUND', 'Yolculuk bulunamadı.');
  return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
}

// Unpaid reservations past their deadline give their seat back.
async function expireStaleReservations(tx: Tx, tripId: string, now: Date) {
  await tx.booking.updateMany({
    where: { tripId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
}

export async function createBooking(passengerId: string, tripId: string) {
  const row = await prisma.$transaction(async tx => {
    const trip = await lockTrip(tx, tripId);
    const now = new Date();
    if (trip.status !== 'PUBLISHED' || trip.departureAt <= now) {
      throw new ApiError(409, 'TRIP_NOT_BOOKABLE', 'Bu yolculuk için rezervasyon yapılamaz.');
    }
    if (trip.driverId === passengerId) {
      throw new ApiError(409, 'OWN_TRIP', 'Kendi yolculuğunuza rezervasyon yapamazsınız.');
    }
    await expireStaleReservations(tx, tripId, now);
    const live = await tx.booking.findMany({
      where: { tripId, status: { in: SEAT_HOLDING } },
      select: { passengerId: true },
    });
    if (live.some(booking => booking.passengerId === passengerId)) {
      throw new ApiError(409, 'ALREADY_BOOKED', 'Bu yolculukta zaten bir rezervasyonunuz var.');
    }
    if (live.length >= trip.seatCapacity) {
      throw new ApiError(409, 'TRIP_FULL', 'Bu yolculukta boş koltuk kalmadı.');
    }
    return tx.booking.create({
      data: {
        tripId,
        passengerId,
        priceMinor: trip.priceMinor,
        reservationExpiresAt: new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000),
      },
      select: bookingSelect,
    });
  });
  return toResponse(row);
}

export async function listMyBookings(passengerId: string) {
  // A stale unpaid reservation is shown as expired even if nobody touched its trip since.
  await prisma.booking.updateMany({
    where: { passengerId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  const rows = await prisma.booking.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
    select: bookingSelect,
  });
  return rows.map(toResponse);
}

export async function cancelBooking(passengerId: string, bookingId: string) {
  const row = await prisma.$transaction(async tx => {
    const owned = await tx.booking.findFirst({ where: { id: bookingId, passengerId }, select: { tripId: true } });
    // Another user's booking looks the same as a missing one.
    if (!owned) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Rezervasyon bulunamadı.');
    const trip = await lockTrip(tx, owned.tripId);
    const now = new Date();
    await expireStaleReservations(tx, owned.tripId, now);
    // Read the status again: it may have changed before we got the lock.
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true } });
    if (booking.status !== 'PENDING_PAYMENT' && booking.status !== 'CONFIRMED') {
      throw new ApiError(409, 'BOOKING_NOT_CANCELLABLE', 'Bu rezervasyon iptal edilemez.');
    }
    if (trip.departureAt <= now) {
      throw new ApiError(409, 'TRIP_ALREADY_STARTED', 'Yolculuk başladıktan sonra rezervasyon iptal edilemez.');
    }
    // TODO(WBS-11.1): refund the held payment of a CONFIRMED booking here, in this transaction.
    return tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: now },
      select: bookingSelect,
    });
  });
  return toResponse(row);
}
