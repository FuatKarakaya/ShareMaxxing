import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';
import { FakePaymentProvider } from '../src/payments';
import { findLedgerMismatches } from '../src/payments/ledger';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Run npm test to prepare the isolated test database automatically.');
}

// Payment and ledger rows are never deleted (the ledger is append-only), so this file
// leaves its rows in the _test database. The unique prefix keeps runs apart.
const HOUR = 60 * 60 * 1000;
const prefix = `payment-test-${randomUUID()}`;
const FRONTEND = 'http://localhost:5173';
const provider = new FakePaymentProvider();
const api = request(createApp(undefined, provider));
const paymentIds: string[] = [];

beforeAll(() => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  delete process.env.FRONTEND_ORIGIN;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@itu.edu.tr`,
      passwordHash: 'not-a-real-hash',
      displayName: 'Test Öğrenci',
      emailVerifiedAt: new Date(),
    },
  });
  return { id: user.id, token: issueAccessToken(user.id) };
}

// A passenger with a fresh PENDING_PAYMENT booking on a 400 TL trip.
async function pendingBooking() {
  const driver = await createUser();
  const passenger = await createUser();
  const trip = await prisma.trip.create({
    data: {
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: new Date(Date.now() + 24 * HOUR),
      seatCapacity: 1,
      priceMinor: 40000n,
    },
  });
  const response = await api.post('/api/bookings').set('Authorization', `Bearer ${passenger.token}`)
    .send({ tripId: trip.id }).expect(201);
  return { passenger, tripId: trip.id, bookingId: response.body.booking.id as string };
}

const checkout = (token: string, bookingId: unknown) =>
  api.post('/api/payments/checkout').set('Authorization', `Bearer ${token}`).send({ bookingId });

async function startPayment(token: string, bookingId: string) {
  const response = await checkout(token, bookingId).expect(201);
  const paymentId = response.body.paymentId as string;
  paymentIds.push(paymentId);
  const checkoutToken = provider.tokenFor(paymentId);
  if (!checkoutToken) throw new Error('no fake checkout token');
  return { paymentId, checkoutToken, paymentPageUrl: response.body.paymentPageUrl as string };
}

// iyzico posts the token as form data from the user's browser.
const callback = (paymentId: string, token?: string) =>
  api.post(`/api/payments/callback/${paymentId}`).type('form').send(token ? { token } : {});

function redirectParams(response: request.Response) {
  expect(response.status).toBe(303);
  const url = new URL(response.headers.location);
  expect(`${url.origin}${url.pathname}`).toBe(`${FRONTEND}/yolculuklar/odeme/sonuc`);
  return Object.fromEntries(url.searchParams);
}

const ledgerTypes = async (paymentId: string) =>
  (await prisma.paymentLedgerEntry.findMany({ where: { paymentId }, orderBy: { eventType: 'asc' } }))
    .map(entry => [entry.eventType, entry.amountMinor]);

test('checkout requires login and a valid booking id', async () => {
  await api.post('/api/payments/checkout').send({ bookingId: randomUUID() }).expect(401);
  const user = await createUser();
  await checkout(user.token, 'not-a-uuid').expect(400);
  await checkout(user.token, randomUUID()).expect(404);
});

test("another user's booking looks missing", async () => {
  const { bookingId } = await pendingBooking();
  const other = await createUser();
  const response = await checkout(other.token, bookingId).expect(404);
  expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
});

test('an expired reservation cannot be paid', async () => {
  const { passenger, bookingId } = await pendingBooking();
  await prisma.booking.update({ where: { id: bookingId }, data: { createdAt: new Date(Date.now() - 2 * HOUR), reservationExpiresAt: new Date(Date.now() - HOUR) } });
  const response = await checkout(passenger.token, bookingId).expect(409);
  expect(response.body.error.code).toBe('RESERVATION_EXPIRED');
});

test('a successful payment holds the money, confirms the booking and writes the ledger', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId, checkoutToken, paymentPageUrl } = await startPayment(passenger.token, bookingId);
  expect(paymentPageUrl).toContain(`/api/payments/fake-checkout/${checkoutToken}`);
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({
    status: 'PENDING', amountMinor: 40000n, payerId: passenger.id,
  });

  expect(redirectParams(await callback(paymentId, checkoutToken))).toEqual({ bookingId, status: 'success' });

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  expect(payment.status).toBe('HELD');
  expect(payment.heldAt).not.toBeNull();
  expect(payment.providerPaymentId).toMatch(/^fake-pay-/);
  expect(payment.providerTransactionId).toMatch(/^fake-tx-/);
  expect(await ledgerTypes(paymentId)).toEqual([['PAYMENT', 40000n], ['HOLD', 40000n]]);

  const mine = await api.get('/api/bookings').set('Authorization', `Bearer ${passenger.token}`).expect(200);
  expect(mine.body.bookings[0]).toMatchObject({ id: bookingId, status: 'CONFIRMED', paymentStatus: 'HELD' });

  // Paying again is refused.
  expect((await checkout(passenger.token, bookingId).expect(409)).body.error.code).toBe('ALREADY_PAID');
});

test('a duplicate callback changes nothing', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId, checkoutToken } = await startPayment(passenger.token, bookingId);
  await callback(paymentId, checkoutToken);
  expect(redirectParams(await callback(paymentId, checkoutToken))).toEqual({ bookingId, status: 'success' });
  expect(await ledgerTypes(paymentId)).toHaveLength(2);
});

test('a declined payment fails and the booking can be paid again', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const first = await startPayment(passenger.token, bookingId);
  provider.setOutcome(first.checkoutToken, 'declined');
  expect(redirectParams(await callback(first.paymentId, first.checkoutToken)))
    .toEqual({ bookingId, status: 'failed', code: 'DECLINED' });
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } }))
    .toMatchObject({ status: 'FAILED', failureCode: 'DECLINED' });
  expect(await ledgerTypes(first.paymentId)).toEqual([]);
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('PENDING_PAYMENT');

  const retry = await startPayment(passenger.token, bookingId);
  expect(retry.paymentId).not.toBe(first.paymentId);
  expect(redirectParams(await callback(retry.paymentId, retry.checkoutToken)).status).toBe('success');
});

test('an uncertain result keeps the payment pending, and checkout reuses it', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const first = await startPayment(passenger.token, bookingId);
  provider.setOutcome(first.checkoutToken, 'timeout');
  expect(redirectParams(await callback(first.paymentId, first.checkoutToken)).status).toBe('pending');
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } })).status).toBe('PENDING');

  const again = await startPayment(passenger.token, bookingId);
  expect(again.paymentId).toBe(first.paymentId);
  expect(again.checkoutToken).not.toBe(first.checkoutToken);
});

test.each(['amount', 'conversationId', 'basketId'] as const)('a result with a different %s is not accepted', async field => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId, checkoutToken } = await startPayment(passenger.token, bookingId);
  provider.setOutcome(checkoutToken, { tamper: field });
  expect(redirectParams(await callback(paymentId, checkoutToken)).code).toBe('RESULT_MISMATCH');
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING');
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('PENDING_PAYMENT');
  expect(await ledgerTypes(paymentId)).toEqual([]);
});

test('a callback without a token or for an unknown payment fails safely', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId } = await startPayment(passenger.token, bookingId);
  expect(redirectParams(await callback(paymentId)).code).toBe('MISSING_TOKEN');
  expect(redirectParams(await callback(randomUUID(), 'x')).code).toBe('PAYMENT_NOT_FOUND');
  expect(redirectParams(await callback('not-a-uuid', 'x')).code).toBe('PAYMENT_NOT_FOUND');
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING');
});

test('a payment that arrives after the reservation expired is held but does not confirm the seat', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId, checkoutToken } = await startPayment(passenger.token, bookingId);
  await prisma.booking.update({ where: { id: bookingId }, data: { createdAt: new Date(Date.now() - 2 * HOUR), reservationExpiresAt: new Date(Date.now() - HOUR) } });

  expect(redirectParams(await callback(paymentId, checkoutToken))).toEqual({ bookingId, status: 'expired' });
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('HELD');
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('EXPIRED');
  expect(await ledgerTypes(paymentId)).toEqual([['PAYMENT', 40000n], ['HOLD', 40000n]]);
});

test('a provider error at checkout closes the new attempt', async () => {
  const { passenger, bookingId } = await pendingBooking();
  provider.failStart({ ok: false, failureCode: 'IYZICO_X', message: 'Ödeme tamamlanamadı.', uncertain: false });
  try {
    const response = await checkout(passenger.token, bookingId).expect(502);
    expect(response.body.error).toEqual({ code: 'PAYMENT_PROVIDER_ERROR', message: 'Ödeme tamamlanamadı.' });
  } finally {
    provider.failStart(null);
  }
  const payments = await prisma.payment.findMany({ where: { bookingId } });
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ status: 'FAILED', failureCode: 'IYZICO_X' });
});

test('the local fake payment page completes a payment', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId, checkoutToken } = await startPayment(passenger.token, bookingId);
  const page = await api.get(`/api/payments/fake-checkout/${checkoutToken}`).expect(200);
  expect(page.text).toContain('400.00 TL');
  await api.get('/api/payments/fake-checkout/fake-token-00000000-0000-0000-0000-000000000000').expect(404);
  const done = await api.post(`/api/payments/fake-checkout/${checkoutToken}/success`);
  expect(redirectParams(done)).toEqual({ bookingId, status: 'success' });
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('HELD');
});

test('the fake payment page does not exist with a real provider', async () => {
  const realLike = request(createApp(undefined, {
    name: 'iyzico',
    startCheckout: async () => ({ ok: false, failureCode: 'X', message: 'x', uncertain: false }),
    getCheckoutResult: async () => ({ ok: false, failureCode: 'X', message: 'x', uncertain: false }),
    refund: async () => ({ ok: false, failureCode: 'X', message: 'x', uncertain: false }),
  }));
  await realLike.get(`/api/payments/fake-checkout/fake-token-${randomUUID()}`).expect(404);
});

test('the ledger is append-only', async () => {
  const entry = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { paymentId: { in: paymentIds } } });
  await expect(prisma.paymentLedgerEntry.update({ where: { id: entry.id }, data: { amountMinor: 1n } })).rejects.toThrow();
  await expect(prisma.paymentLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
});

test('every payment made in this file matches the ledger', async () => {
  expect(paymentIds.length).toBeGreaterThan(5);
  expect(await findLedgerMismatches(paymentIds)).toEqual([]);
});

test('the balance check finds a payment that does not match the ledger', async () => {
  const { passenger, bookingId } = await pendingBooking();
  const { paymentId } = await startPayment(passenger.token, bookingId);
  paymentIds.splice(paymentIds.indexOf(paymentId), 1);
  // A HELD payment without ledger rows: exactly what the check must catch.
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'HELD' } });
  const mismatches = await findLedgerMismatches([paymentId]);
  expect(mismatches).toHaveLength(1);
  expect(mismatches[0]).toMatchObject({ paymentId, status: 'HELD', receivedMinor: 0n });
});
