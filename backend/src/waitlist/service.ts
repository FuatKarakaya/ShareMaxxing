import { Prisma, type BookingStatus, type Trip } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

// Optional waitlist of a full trip (WBS-8.1), see docs/Waitlist.md.
// Every function that changes the list runs inside a transaction that holds
// the trip row lock (SELECT ... FOR UPDATE), like the booking service.

type Tx = Prisma.TransactionClient;

// A freed seat is held for the first person in line this long, or until departure if sooner (FR-16).
export const OFFER_HOURS = 6;
const SEAT_HOLDING: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'];

export async function lockTrip(tx: Tx, tripId: string): Promise<Trip> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, 'TRIP_NOT_FOUND', 'Yolculuk bulunamadı.');
  return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
}

// Seats held for other people's live offers. The caller's own offer does not count.
export async function seatsOfferedToOthers(tx: Tx, tripId: string, userId: string, now: Date): Promise<number> {
  return tx.waitlistEntry.count({ where: { tripId, status: 'OFFERED', offerExpiresAt: { gt: now }, userId: { not: userId } } });
}

// Ends old offers and offers every free seat to the next people in line.
// Call it with the trip locked, after any change that can free a seat.
export async function refreshWaitlist(tx: Tx, trip: Trip, now: Date): Promise<void> {
  await tx.waitlistEntry.updateMany({
    where: { tripId: trip.id, status: 'OFFERED', offerExpiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  if (trip.status !== 'PUBLISHED' || trip.departureAt <= now) {
    await tx.waitlistEntry.updateMany({ where: { tripId: trip.id, status: { in: ['WAITING', 'OFFERED'] } }, data: { status: 'EXPIRED' } });
    return;
  }
  const booked = await tx.booking.count({ where: { tripId: trip.id, status: { in: SEAT_HOLDING } } });
  const offered = await tx.waitlistEntry.count({ where: { tripId: trip.id, status: 'OFFERED' } });
  const free = trip.seatCapacity - booked - offered;
  if (free <= 0) return;

  const next = await tx.waitlistEntry.findMany({
    where: { tripId: trip.id, status: 'WAITING' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: free,
  });
  const deadline = new Date(Math.min(now.getTime() + OFFER_HOURS * 3_600_000, trip.departureAt.getTime()));
  for (const entry of next) {
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'OFFERED', offerExpiresAt: deadline } });
    await tx.notification.create({
      data: {
        recipientId: entry.userId,
        kind: 'BOOKING',
        payload: {
          text: 'Bekleme listesinde olduğunuz yolculukta sizin için bir koltuk ayrıldı. Süre dolmadan rezervasyon yapın.',
          link: `/yolculuklar/${trip.id}`,
          offerExpiresAt: deadline.toISOString(),
        },
      },
    });
  }
}

// Called by createBooking when the caller booked the trip.
export async function markBooked(tx: Tx, tripId: string, userId: string): Promise<void> {
  await tx.waitlistEntry.updateMany({ where: { tripId, userId, status: { in: ['WAITING', 'OFFERED'] } }, data: { status: 'BOOKED' } });
}

const entrySelect = {
  id: true,
  status: true,
  offerExpiresAt: true,
  createdAt: true,
  trip: {
    select: {
      id: true,
      departureAt: true,
      originCity: { select: { code: true, name: true } },
      destinationCity: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.WaitlistEntrySelect;

type EntryRow = Prisma.WaitlistEntryGetPayload<{ select: typeof entrySelect }>;

// Place in line: 1 is next. An OFFERED entry has no place, it has a deadline.
async function toResponse(db: Tx | typeof prisma, row: EntryRow, tripId: string) {
  let position: number | null = null;
  if (row.status === 'WAITING') {
    position = 1 + await db.waitlistEntry.count({
      where: {
        tripId,
        status: 'WAITING',
        OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }],
      },
    });
  }
  return { ...row, position };
}

export async function joinWaitlist(userId: string, tripId: string) {
  return prisma.$transaction(async tx => {
    const trip = await lockTrip(tx, tripId);
    const now = new Date();
    await tx.booking.updateMany({ where: { tripId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
    await refreshWaitlist(tx, trip, now);
    if (trip.status !== 'PUBLISHED' || trip.departureAt <= now) {
      throw new ApiError(409, 'TRIP_NOT_BOOKABLE', 'Bu yolculuk için bekleme listesine girilemez.');
    }
    if (trip.driverId === userId) throw new ApiError(409, 'OWN_TRIP', 'Kendi yolculuğunuzun bekleme listesine giremezsiniz.');

    const existing = await tx.waitlistEntry.findFirst({ where: { tripId, userId, status: { in: ['WAITING', 'OFFERED'] } }, select: entrySelect });
    // Already on the list: show the current place (UC-08 E1).
    if (existing) return { created: false, entry: await toResponse(tx, existing, tripId) };

    const live = await tx.booking.findMany({ where: { tripId, status: { in: SEAT_HOLDING } }, select: { passengerId: true } });
    if (live.some(booking => booking.passengerId === userId)) {
      throw new ApiError(409, 'ALREADY_BOOKED', 'Bu yolculukta zaten bir rezervasyonunuz var.');
    }
    if (live.length + await seatsOfferedToOthers(tx, tripId, userId, now) < trip.seatCapacity) {
      throw new ApiError(409, 'SEATS_AVAILABLE', 'Bu yolculukta boş koltuk var, doğrudan rezervasyon yapabilirsiniz.');
    }
    const row = await tx.waitlistEntry.create({ data: { tripId, userId }, select: entrySelect });
    return { created: true, entry: await toResponse(tx, row, tripId) };
  });
}

export async function leaveWaitlist(userId: string, tripId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const trip = await lockTrip(tx, tripId);
    const left = await tx.waitlistEntry.updateMany({ where: { tripId, userId, status: { in: ['WAITING', 'OFFERED'] } }, data: { status: 'LEFT' } });
    if (!left.count) throw new ApiError(404, 'WAITLIST_ENTRY_NOT_FOUND', 'Bu yolculuğun bekleme listesinde değilsiniz.');
    // A seat held for the caller goes to the next person in line.
    await refreshWaitlist(tx, trip, new Date());
  });
}

// The caller's live entries, newest first. Each trip is refreshed first, so
// ended offers and freed seats are up to date.
export async function listMyWaitlist(userId: string) {
  const tripIds = await prisma.waitlistEntry.findMany({
    where: { userId, status: { in: ['WAITING', 'OFFERED'] } },
    select: { tripId: true },
  });
  const entries = [];
  for (const { tripId } of tripIds) {
    const entry = await prisma.$transaction(async tx => {
      const trip = await lockTrip(tx, tripId);
      const now = new Date();
      await tx.booking.updateMany({ where: { tripId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
      await refreshWaitlist(tx, trip, now);
      const row = await tx.waitlistEntry.findFirst({ where: { tripId, userId, status: { in: ['WAITING', 'OFFERED'] } }, select: entrySelect });
      return row && toResponse(tx, row, tripId);
    });
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
