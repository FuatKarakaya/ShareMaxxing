import express from 'express';
import { createHousingRouter } from './housing/router';
import { createAuthRouter } from './auth/router';
import { createBookingRouter } from './bookings/router';
import { createForumRouter } from './forum/router';
import { allowOrigin } from './lib/cors';
import { errorHandler } from './lib/errors';
import { createCitiesRouter, createTripRouter } from './trips/router';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Live-site settings, see docs/CloudSetup.md. Both are off when the variables are not set.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  if (process.env.FRONTEND_ORIGIN) app.use(allowOrigin(process.env.FRONTEND_ORIGIN));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/api/forum', createForumRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/bookings', createBookingRouter());
  app.use('/api/cities', createCitiesRouter());
  app.use('/api/trips', createTripRouter());
  app.use('/api/housing', createHousingRouter());
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Adres bulunamadı.' } });
  });
  app.use(errorHandler);
  return app;
}

export default createApp();
