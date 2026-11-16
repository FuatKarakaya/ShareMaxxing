import express from 'express';
import { createHousingRouter } from './housing/router';
import type { SendVerificationCode } from './auth/verification-mail';
import { createAuthRouter } from './auth/router';
import { createBookingRouter } from './bookings/router';
import { createForumRouter } from './forum/router';
import { createReportRouter } from './reports/router';
import { errorHandler } from './lib/errors';
import { createCitiesRouter, createTripRouter } from './trips/router';

export function createApp(sendVerificationCode?: SendVerificationCode) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/api/reports', createReportRouter());
  app.use('/api/forum', createForumRouter());
  app.use('/api/auth', createAuthRouter(sendVerificationCode));
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
