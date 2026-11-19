import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { expireStaleReservations, lockTrip } from '../bookings/service';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { recordLedgerEvent } from './ledger';
import type { CheckoutResult, PaymentProvider } from './provider';

// Pay and hold (WBS-10.1) with iyzico's hosted Checkout Form.
// Lock order everywhere: trip row first (same rule as bookings), then the payment row.

type Tx = Prisma.TransactionClient;

async function lockPayment(tx: Tx, paymentId: string) {
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

// Starts (or restarts) the payment of the caller's own PENDING_PAYMENT booking and
// returns the iyzico page the browser should be sent to.
export async function startCheckout(
  provider: PaymentProvider,
  passengerId: string,
  bookingId: string,
  request: { ip: string; apiOrigin: string },
) {
  const { payment, created } = await prisma.$transaction(async tx => {
    const owned = await tx.booking.findFirst({ where: { id: bookingId, passengerId }, select: { tripId: true } });
    // Another user's booking looks the same as a missing one.
    if (!owned) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Rezervasyon bulunamadı.');
    await lockTrip(tx, owned.tripId);
    await expireStaleReservations(tx, owned.tripId, new Date());
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.status === 'EXPIRED') {
      throw new ApiError(409, 'RESERVATION_EXPIRED', 'Rezervasyon süresi doldu. Lütfen yeniden rezervasyon yapın.');
    }
    if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      throw new ApiError(409, 'ALREADY_PAID', 'Bu rezervasyonun ödemesi zaten yapıldı.');
    }
    if (booking.status !== 'PENDING_PAYMENT') {
      throw new ApiError(409, 'BOOKING_NOT_PAYABLE', 'Bu rezervasyon için ödeme yapılamaz.');
    }
    // At most one non-failed payment per booking (one_nonfailed_payment_per_booking).
    const existing = await tx.payment.findFirst({ where: { bookingId, status: { not: 'FAILED' } } });
    if (existing) {
      if (existing.status !== 'PENDING' && existing.status !== 'CREATED') {
        throw new ApiError(409, 'ALREADY_PAID', 'Bu rezervasyonun ödemesi zaten yapıldı.');
      }
      // The user left an earlier payment page: open a new page for the same attempt.
      return { payment: existing, created: false };
    }
    const payment = await tx.payment.create({
      data: {
        bookingId,
        payerId: passengerId,
        amountMinor: booking.priceMinor,
        idempotencyKey: randomUUID(),
        status: 'PENDING',
      },
    });
    return { payment, created: true };
  });

  // The provider call happens after commit: never hold row locks across the network.
  const result = await provider.startCheckout({
    paymentId: payment.id,
    bookingId,
    amountMinor: payment.amountMinor,
    buyerId: passengerId,
    ip: request.ip,
    callbackUrl: `${request.apiOrigin}/api/payments/callback/${payment.id}`,
  });
  if (!result.ok) {
    // Nothing was collected for a new attempt, so it can be closed. A reused attempt
    // stays PENDING: an earlier payment page for it may still complete.
    if (created && !result.uncertain) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED', failureCode: result.failureCode },
      });
    }
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', result.message);
  }
  return { paymentId: payment.id, paymentPageUrl: result.paymentPageUrl };
}

export type CallbackOutcome = {
  bookingId: string | null;
  status: 'success' | 'failed' | 'pending' | 'expired';
  code?: string;
};

// Handles iyzico's browser callback. The token is only a pointer: the result is
// always read from iyzico server-side and checked against the payment we created.
export async function handleCheckoutCallback(
  provider: PaymentProvider,
  paymentId: string,
  token: string | undefined,
): Promise<CallbackOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { bookingId: true, amountMinor: true, booking: { select: { tripId: true } } },
  });
  if (!payment) return { bookingId: null, status: 'failed', code: 'PAYMENT_NOT_FOUND' };
  const { bookingId } = payment;
  if (!token) return { bookingId, status: 'failed', code: 'MISSING_TOKEN' };

  const result: CheckoutResult = await provider.getCheckoutResult(token);
  if (result.ok && (
    result.conversationId !== paymentId
    || result.basketId !== bookingId
    || result.paidAmountMinor !== payment.amountMinor
  )) {
    // Not this payment's result (or a changed amount). Leave this payment untouched.
    console.error('Payment callback result does not match the payment attempt.', { paymentId });
    return { bookingId, status: 'failed', code: 'RESULT_MISMATCH' };
  }

  return prisma.$transaction(async tx => {
    await lockTrip(tx, payment.booking.tripId);
    const current = await lockPayment(tx, paymentId);

    if (current.status === 'HELD' || current.status === 'RELEASED' || current.status === 'REFUNDED') {
      // Duplicate or late callback: already processed, change nothing.
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true } });
      return { bookingId, status: booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' ? 'success' : 'expired' };
    }

    if (!result.ok) {
      if (result.uncertain) return { bookingId, status: 'pending', code: result.failureCode };
      if (current.status === 'PENDING' || current.status === 'CREATED') {
        await tx.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', failureCode: result.failureCode } });
      }
      return { bookingId, status: 'failed', code: result.failureCode };
    }

    if (current.status === 'FAILED') {
      // Money was collected for an attempt we already closed. Needs a manual check.
      console.error('Successful payment result for a FAILED payment attempt.', { paymentId });
      return { bookingId, status: 'failed', code: 'PAYMENT_ALREADY_FAILED' };
    }

    const now = new Date();
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'HELD',
        heldAt: now,
        failureCode: null,
        providerPaymentId: result.providerPaymentId,
        providerTransactionId: result.providerTransactionId,
      },
    });
    await recordLedgerEvent(tx, paymentId, 'PAYMENT', current.amountMinor);
    await recordLedgerEvent(tx, paymentId, 'HOLD', current.amountMinor);

    await expireStaleReservations(tx, payment.booking.tripId, now);
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true } });
    if (booking.status !== 'PENDING_PAYMENT') {
      // Paid after the reservation expired or was cancelled: the seat is not confirmed.
      // The HELD payment is refunded by the refund step (WBS-11.1).
      return { bookingId, status: 'expired' };
    }
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
    return { bookingId, status: 'success' };
  });
}
