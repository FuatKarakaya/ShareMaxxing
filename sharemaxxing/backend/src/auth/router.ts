import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from './middleware';
import { login, signup } from './service';
import { credentials, signupInput } from './validation';

export function createAuthRouter(): Router {
  const router = Router();
  const authLimit = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' } },
  });
  router.post('/signup', authLimit(), async (req, res, next) => {
    try {
      res.status(201).json(await signup(signupInput(req.body)));
    } catch (error) {
      next(error);
    }
  });
  router.post('/login', authLimit(), async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await login(credentials(req.body)));
    } catch (error) {
      next(error);
    }
  });
  router.get('/me', authenticate, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: res.locals.user });
  });
  return router;
}
