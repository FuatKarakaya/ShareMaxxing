import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './service';

export function createNotificationRouter(): Router {
  const router = Router();
  router.use(authenticate, (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/unread-count', async (_req, res, next) => {
    try {
      res.json(await getUnreadCount(res.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      res.json(await listNotifications(res.locals.user.id, req.query));
    } catch (error) {
      next(error);
    }
  });

  router.post('/read-all', async (_req, res, next) => {
    try {
      res.json(await markAllNotificationsRead(res.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/read-all', async (_req, res, next) => {
    try {
      res.json(await markAllNotificationsRead(res.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/read', async (req, res, next) => {
    try {
      res.json(await markNotificationRead(res.locals.user.id, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id/read', async (req, res, next) => {
    try {
      res.json(await markNotificationRead(res.locals.user.id, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
