import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import { ApiError } from '../lib/errors';
import { joinWaitlist, leaveWaitlist, listMyWaitlist } from './service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tripId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'tripId geçerli bir kimlik olmalıdır.');
  }
  return value.toLowerCase();
}

export function createWaitlistRouter(): Router {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/', async (_req, res, next) => {
    try { res.json({ entries: await listMyWaitlist(res.locals.user.id) }); } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const result = await joinWaitlist(res.locals.user.id, tripId(body.tripId));
      res.status(result.created ? 201 : 200).json({ entry: result.entry });
    } catch (error) { next(error); }
  });

  router.delete('/:tripId', async (req, res, next) => {
    try { await leaveWaitlist(res.locals.user.id, tripId(req.params.tripId)); res.status(204).end(); } catch (error) { next(error); }
  });

  return router;
}
