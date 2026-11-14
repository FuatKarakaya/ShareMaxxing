import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import {
  cancelTrip,
  createTrip,
  getTripDetail,
  listCities,
  listMyTrips,
  searchTrips,
  updateTrip,
} from './service';
import { parseUuid } from './validation';

export function createCitiesRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (_req, res, next) => {
    try {
      const cities = await listCities();
      res.json({ cities });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createTripRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.post('/', async (req, res, next) => {
    try {
      const trip = await createTrip(res.locals.user.id, req.body);
      res.status(201).json({ trip });
    } catch (error) {
      next(error);
    }
  });

  router.get('/mine', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const trips = await listMyTrips(res.locals.user.id);
      res.json({ trips });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const trips = await searchTrips(req.query);
      res.json({ trips });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:tripId', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const trip = await getTripDetail(parseUuid(req.params.tripId, 'tripId'));
      res.json({ trip });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:tripId', async (req, res, next) => {
    try {
      const trip = await updateTrip(res.locals.user.id, parseUuid(req.params.tripId, 'tripId'), req.body);
      res.json({ trip });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:tripId/cancel', async (req, res, next) => {
    try {
      const trip = await cancelTrip(res.locals.user.id, parseUuid(req.params.tripId, 'tripId'));
      res.json({ trip });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
