import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import { prisma } from '../lib/prisma';
import { listHousing, getHousing, createHousing, changeHousing } from './service';
export function createHousingRouter(): Router {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/districts', async (_req, res, next) => {
    try { res.json({ districts: await prisma.istanbulDistrict.findMany({ orderBy: { name: 'asc' } }) }); } catch (error) { next(error); }
  });
  router.get('/mine', async (req, res, next) => {
    try { res.json(await listHousing(res.locals.user, req.query, true)); } catch (error) { next(error); }
  });
  router.get('/', async (req, res, next) => {
    try { res.json(await listHousing(res.locals.user, req.query)); } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try { res.json({ listing: await getHousing(res.locals.user, req.params.id) }); } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try { res.status(201).json({ listing: await createHousing(res.locals.user, req.body) }); } catch (error) { next(error); }
  });
  router.patch('/:id', async (req, res, next) => {
    try { res.json({ listing: await changeHousing(res.locals.user, req.params.id, req.body) }); } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { await changeHousing(res.locals.user, req.params.id, undefined, true); res.status(204).end(); } catch (error) { next(error); }
  });
  return router;
}
