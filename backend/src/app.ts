import express from 'express';
import { createHousingRouter } from './housing/router';
import type { SendVerificationCode } from './auth/verification-mail';
import { createAuthRouter } from './auth/router';
import { createBookingRouter } from './bookings/router';
import { createForumRouter } from './forum/router';
import { createPaymentProvider, type PaymentProvider } from './payments';
import { createPaymentRouter } from './payments/router';
import { createReportRouter } from './reports/router';
import { profilesRouter } from './profiles/router';
import { allowOrigin } from './lib/cors';
import { errorHandler } from './lib/errors';
import { createCitiesRouter, createTripRouter } from './trips/router';
import { createWaitlistRouter } from './waitlist/router';

export function createApp(sendVerificationCode?: SendVerificationCode, paymentProvider?: PaymentProvider) {
  const app = express();
  // Created on first use, so a missing payment configuration does not stop the whole API.
  let payments = paymentProvider;
  const getPaymentProvider = () => (payments ??= createPaymentProvider());
  app.disable('x-powered-by');
  // Live-site settings, see docs/CloudSetup.md. Both are off when the variables are not set.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  if (process.env.FRONTEND_ORIGIN) app.use(allowOrigin(process.env.FRONTEND_ORIGIN));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/api/reports', createReportRouter());
  app.use('/api/profiles', profilesRouter);
  app.use('/api/forum', createForumRouter());
  app.use('/api/auth', createAuthRouter(sendVerificationCode));
  app.use('/api/bookings', createBookingRouter());
  app.use('/api/payments', createPaymentRouter(getPaymentProvider));
  app.use('/api/cities', createCitiesRouter());
  app.use('/api/trips', createTripRouter());
  app.use('/api/housing', createHousingRouter());
  app.use('/api/waitlist', createWaitlistRouter());
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Adres bulunamadı.' } });
  });
  app.use(errorHandler);
  return app;
}

export default createApp();
