import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import { invalid, object, text, uuid } from '../content/validation';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

type PublicProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  ridesAsDriver: number;
  ridesAsPassenger: number;
  ratingCount: number;
  averageRating: number | null;
};

export const profilesRouter = Router();
profilesRouter.use(authenticate, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

profilesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    // Return aggregate history only. Booking IDs, passenger identities and
    // funded-seat details must never appear on a public profile.
    const [profile] = await prisma.$queryRaw<PublicProfile[]>`
      SELECT u.id, u.display_name AS "displayName", u.bio,
        (SELECT count(*)::int FROM trips
         WHERE driver_id = u.id AND status = 'COMPLETED') AS "ridesAsDriver",
        (SELECT count(DISTINCT trip_id)::int FROM bookings
         WHERE passenger_id = u.id AND status = 'COMPLETED') AS "ridesAsPassenger",
        ratings.count AS "ratingCount", ratings.average AS "averageRating"
      FROM users u
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS count, round(avg(r.score), 1)::float8 AS average
        FROM revealed_ride_ratings r
        JOIN bookings b ON b.id = r.booking_id
        JOIN trips t ON t.id = b.trip_id
        WHERE (r.direction = 'PASSENGER_TO_DRIVER' AND t.driver_id = u.id)
           OR (r.direction = 'DRIVER_TO_PASSENGER' AND b.passenger_id = u.id)
      ) ratings
      WHERE u.id = ${id}::uuid AND u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL
    `;
    if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Profil bulunamadı.');
    res.json({ profile });
  } catch (error) { next(error); }
});

profilesRouter.patch('/me', async (req, res, next) => {
  try {
    const fields = object(req.body, ['displayName', 'bio']);
    if (!Object.keys(fields).length) throw invalid();
    const data: { displayName?: string; bio?: string | null } = {};
    if ('displayName' in fields) data.displayName = text(fields.displayName, 100);
    if ('bio' in fields) {
      if (fields.bio !== null && typeof fields.bio !== 'string') throw invalid();
      data.bio = fields.bio?.trim() || null;
      if (data.bio && data.bio.length > 500) throw invalid();
    }
    const profile = await prisma.user.update({
      where: { id: res.locals.user.id },
      data,
      select: { id: true, displayName: true, bio: true },
    });
    res.json({ profile });
  } catch (error) { next(error); }
});
