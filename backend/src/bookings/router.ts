import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import { ApiError } from '../lib/errors';
import { cancelBooking, createBooking, listMyBookings } from './service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} geçerli bir kimlik olmalıdır.`);
  }
  return value.toLowerCase();
}

export function createBookingRouter(): Router {
  const router = Router();
  router.use(authenticate);

  // Book one seat on a trip. The seat is held until the payment step finishes or the hold expires.
  router.post('/', async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const booking = await createBooking(res.locals.user.id, uuid(body.tripId, 'tripId'));
      res.status(201).json({ booking });
    } catch (error) {
      next(error);
    }
  });

  // "My bookings": only the caller's own bookings.
  router.get('/', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ bookings: await listMyBookings(res.locals.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:bookingId/cancel', async (req, res, next) => {
    try {
      const booking = await cancelBooking(res.locals.user.id, uuid(req.params.bookingId, 'bookingId'));
      res.json({ booking });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
