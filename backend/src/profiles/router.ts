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
  recentRatings: { score: number; review: string | null }[];
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
      WITH received AS (
        SELECT r.score, r.review, r.created_at, r.booking_id, b.sponsorship_request_id
        FROM revealed_ride_ratings r
        JOIN bookings b ON b.id = r.booking_id
        JOIN trips t ON t.id = b.trip_id
        WHERE b.status = 'COMPLETED' AND (
          (r.direction = 'PASSENGER_TO_DRIVER' AND t.driver_id = ${id}::uuid)
          OR (r.direction = 'DRIVER_TO_PASSENGER' AND b.passenger_id = ${id}::uuid
              AND b.sponsorship_request_id IS NULL)
        )
      )
      SELECT u.id, u.display_name AS "displayName", u.bio,
        (SELECT count(*)::int FROM trips
         WHERE driver_id = u.id AND status = 'COMPLETED') AS "ridesAsDriver",
        (SELECT count(DISTINCT trip_id)::int FROM bookings
         WHERE passenger_id = u.id AND status = 'COMPLETED') AS "ridesAsPassenger",
        (SELECT count(*)::int FROM received) AS "ratingCount",
        (SELECT round(avg(score), 2)::float8 FROM received) AS "averageRating",
        ARRAY(SELECT json_build_object('score', score, 'review', review)
              FROM received WHERE sponsorship_request_id IS NULL
              ORDER BY created_at DESC, booking_id LIMIT 20)::json[] AS "recentRatings"
      FROM users u
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
