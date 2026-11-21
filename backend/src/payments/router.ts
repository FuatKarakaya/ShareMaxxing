import express, { Router, type Request } from 'express';
import { authenticate } from '../auth/middleware';
import { ApiError } from '../lib/errors';
import { FakePaymentProvider } from './fake-provider';
import { formatPrice, type PaymentProvider } from './provider';
import { handleCheckoutCallback, type CallbackOutcome } from './service';
import { startCheckout } from './service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAKE_TOKEN = /^fake-token-[0-9a-f-]{36}$/;

// The frontend page that shows the payment result (WBS-10.3).
function resultUrl(outcome: CallbackOutcome) {
  const url = new URL('/yolculuklar/odeme/sonuc', process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173');
  if (outcome.bookingId) url.searchParams.set('bookingId', outcome.bookingId);
  url.searchParams.set('status', outcome.status);
  if (outcome.code) url.searchParams.set('code', outcome.code);
  return url.toString();
}

// iyzico expects a plain IPv4 address.
function clientIp(req: Request) {
  const ip = (req.ip ?? '').replace(/^::ffff:/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '127.0.0.1';
}

export function createPaymentRouter(getProvider: () => PaymentProvider): Router {
  const router = Router();

  function provider() {
    try {
      return getProvider();
    } catch (error) {
      console.error('Payment provider is not configured:', error instanceof Error ? error.message : error);
      throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Ödeme şu anda kullanılamıyor.');
    }
  }

  async function callback(paymentId: string, token: string | undefined) {
    if (!UUID.test(paymentId)) return { bookingId: null, status: 'failed', code: 'PAYMENT_NOT_FOUND' } as const;
    try {
      return await handleCheckoutCallback(provider(), paymentId.toLowerCase(), token);
    } catch (error) {
      console.error('Payment callback failed:', error instanceof Error ? error.name : 'UnknownError');
      return { bookingId: null, status: 'pending', code: 'CALLBACK_ERROR' } as const;
    }
  }

  // Starts the payment of the caller's own booking. The frontend redirects to paymentPageUrl.
  router.post('/checkout', authenticate, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      if (typeof body.bookingId !== 'string' || !UUID.test(body.bookingId)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'bookingId geçerli bir kimlik olmalıdır.');
      }
      const result = await startCheckout(provider(), res.locals.user.id, body.bookingId.toLowerCase(), {
        ip: clientIp(req),
        apiOrigin: `${req.protocol}://${req.get('host')}`,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // iyzico sends the user's browser here with the checkout token (form POST, no login).
  router.post('/callback/:paymentId', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
    res.redirect(303, resultUrl(await callback(req.params.paymentId, token)));
  });

  // Local payment page of the fake provider, so the app can be clicked through without iyzico keys.
  router.get('/fake-checkout/:token', (req, res, next) => {
    const fake = getFakeProvider();
    const checkout = fake && FAKE_TOKEN.test(req.params.token) ? fake.checkout(req.params.token) : undefined;
    if (!checkout) return next();
    const action = (outcome: string) => `/api/payments/fake-checkout/${req.params.token}/${outcome}`;
    res.type('html').send(`<!doctype html><html lang="tr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Test ödeme sayfası</title>
<body style="font-family:system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem">
<h1>Test ödeme sayfası</h1><p>Bu sayfa yalnızca yerel geliştirme içindir. Gerçek ödeme alınmaz.</p>
<p>Tutar: <strong>${formatPrice(checkout.amountMinor)} TL</strong></p>
<form method="post" action="${action('success')}"><button>Başarılı öde</button></form><br>
<form method="post" action="${action('declined')}"><button>Reddet</button></form>
</body></html>`);
  });

  router.post('/fake-checkout/:token/:outcome', async (req, res, next) => {
    const fake = getFakeProvider();
    const { token, outcome } = req.params;
    const checkout = fake && FAKE_TOKEN.test(token) ? fake.checkout(token) : undefined;
    if (!fake || !checkout || (outcome !== 'success' && outcome !== 'declined')) return next();
    fake.setOutcome(token, outcome);
    res.redirect(303, resultUrl(await callback(checkout.paymentId, token)));
  });

  function getFakeProvider() {
    try {
      const current = getProvider();
      return current instanceof FakePaymentProvider ? current : null;
    } catch {
      return null;
    }
  }

  return router;
}
