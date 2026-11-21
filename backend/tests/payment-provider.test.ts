import { randomUUID } from 'node:crypto';
import { createPaymentProvider, FakePaymentProvider } from '../src/payments';
import { formatPrice, parsePrice, type StartCheckoutRequest } from '../src/payments/provider';

function startRequest(overrides: Partial<StartCheckoutRequest> = {}): StartCheckoutRequest {
  return {
    paymentId: randomUUID(),
    bookingId: randomUUID(),
    amountMinor: 25_000n,
    buyerId: randomUUID(),
    ip: '127.0.0.1',
    callbackUrl: 'http://localhost:3000/api/payments/callback/x',
    ...overrides,
  };
}

async function started(provider: FakePaymentProvider, request = startRequest()) {
  const result = await provider.startCheckout(request);
  if (!result.ok) throw new Error('expected checkout to start');
  return { request, ...result };
}

describe('fake payment provider', () => {
  let provider: FakePaymentProvider;
  beforeEach(() => { provider = new FakePaymentProvider(); });

  test('a checkout gets a token and a local payment page', async () => {
    const { token, paymentPageUrl } = await started(provider);
    expect(paymentPageUrl).toBe(`http://localhost:3000/api/payments/fake-checkout/${token}`);
  });

  test('a successful checkout returns the payment details', async () => {
    const { request, token } = await started(provider);
    const result = await provider.getCheckoutResult(token);
    expect(result).toMatchObject({
      ok: true, conversationId: request.paymentId, basketId: request.bookingId, paidAmountMinor: 25_000n,
    });
  });

  test('reading the same result twice returns the same IDs', async () => {
    const { token } = await started(provider);
    expect(await provider.getCheckoutResult(token)).toEqual(await provider.getCheckoutResult(token));
  });

  test('declined and timeout outcomes', async () => {
    const declined = await started(provider);
    provider.setOutcome(declined.token, 'declined');
    expect(await provider.getCheckoutResult(declined.token)).toMatchObject({ ok: false, failureCode: 'DECLINED', uncertain: false });
    const timeout = await started(provider);
    provider.setOutcome(timeout.token, 'timeout');
    expect(await provider.getCheckoutResult(timeout.token)).toMatchObject({ ok: false, uncertain: true });
  });

  test('a tampered result changes the checked field', async () => {
    const { request, token } = await started(provider);
    provider.setOutcome(token, { tamper: 'amount' });
    expect(await provider.getCheckoutResult(token)).toMatchObject({ ok: true, paidAmountMinor: request.amountMinor - 1n });
  });

  test('unknown tokens fail', async () => {
    expect(await provider.getCheckoutResult('missing')).toMatchObject({ ok: false, failureCode: 'UNKNOWN_TOKEN' });
  });

  test('start failures can be simulated', async () => {
    provider.failStart({ ok: false, failureCode: 'X', message: 'Hata', uncertain: false });
    expect(await provider.startCheckout(startRequest())).toMatchObject({ ok: false, failureCode: 'X' });
  });

  test('refund is idempotent and must match the paid amount', async () => {
    const { token } = await started(provider);
    const paid = await provider.getCheckoutResult(token);
    if (!paid.ok) throw new Error('expected success');
    expect(await provider.refund(paid.providerTransactionId, 1n)).toMatchObject({ ok: false, failureCode: 'INVALID_AMOUNT' });
    const first = await provider.refund(paid.providerTransactionId, 25_000n);
    expect(first.ok).toBe(true);
    expect(await provider.refund(paid.providerTransactionId, 25_000n)).toEqual(first);
    expect(await provider.refund('missing', 1n)).toMatchObject({ ok: false, failureCode: 'UNKNOWN_TRANSACTION' });
  });
});

describe('price format', () => {
  test.each([[40000n, '400.00'], [12345n, '123.45'], [5n, '0.05']])('%s kuruş is %s', (minor, text) => {
    expect(formatPrice(minor)).toBe(text);
    expect(parsePrice(text)).toBe(minor);
  });

  test('parses iyzico price variants and rejects junk', () => {
    expect(parsePrice('400.0')).toBe(40000n);
    expect(parsePrice('400')).toBe(40000n);
    expect(parsePrice(400.5)).toBe(40050n);
    expect(parsePrice('-1')).toBeNull();
    expect(parsePrice('1.234')).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe('createPaymentProvider', () => {
  test('uses the fake provider by default outside production', () => {
    expect(createPaymentProvider({ NODE_ENV: 'test' }).name).toBe('fake');
  });

  test('never uses the fake provider in production', () => {
    expect(() => createPaymentProvider({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'fake' })).toThrow(/production/);
  });

  test('iyzico requires its keys', () => {
    expect(() => createPaymentProvider({ NODE_ENV: 'production' })).toThrow(/configuration is missing/);
  });

  test('uses iyzico when configured', () => {
    const provider = createPaymentProvider({
      NODE_ENV: 'test', PAYMENT_PROVIDER: 'iyzico',
      IYZICO_API_KEY: 'k', IYZICO_SECRET_KEY: 's', IYZICO_BASE_URL: 'https://sandbox-api.iyzipay.com',
    });
    expect(provider.name).toBe('iyzico');
  });

  test('rejects an unknown provider name', () => {
    expect(() => createPaymentProvider({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'stripe' })).toThrow(/Unknown/);
  });
});
