import { randomUUID } from 'node:crypto';
import type {
  CheckoutResult, PaymentProvider, ProviderFailure, RefundResult, StartCheckoutRequest, StartCheckoutResult,
} from './provider';

// In-memory payment provider for tests, CI and local work. No network, no keys.
// Tests pick each checkout's outcome with setOutcome(); the default is success.
// Locally, paymentPageUrl opens a small fake page (GET /api/payments/fake-checkout/:token).

export type FakeOutcome =
  | 'success'
  | 'declined'
  | 'timeout'
  // A success whose details do not match the payment: the service must not confirm it.
  | { tamper: 'amount' | 'conversationId' | 'basketId' };

type FakeCheckout = {
  request: StartCheckoutRequest;
  outcome: FakeOutcome;
  // Set once the checkout has been paid, so a repeated read returns the same IDs.
  paid?: { providerPaymentId: string; providerTransactionId: string };
};

type FakeTransaction = { amountMinor: bigint; refundId?: string };

function failure(failureCode: string, message: string, uncertain = false): ProviderFailure {
  return { ok: false, failureCode, message, uncertain };
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  private readonly checkouts = new Map<string, FakeCheckout>();
  private readonly transactions = new Map<string, FakeTransaction>();
  private startFailure: ProviderFailure | null = null;

  async startCheckout(request: StartCheckoutRequest): Promise<StartCheckoutResult> {
    if (this.startFailure) return this.startFailure;
    if (request.amountMinor <= 0n) return failure('INVALID_AMOUNT', 'Geçersiz ödeme tutarı.');
    const token = `fake-token-${randomUUID()}`;
    this.checkouts.set(token, { request, outcome: 'success' });
    const origin = new URL(request.callbackUrl).origin;
    return { ok: true, token, paymentPageUrl: `${origin}/api/payments/fake-checkout/${token}` };
  }

  async getCheckoutResult(token: string): Promise<CheckoutResult> {
    const checkout = this.checkouts.get(token);
    if (!checkout) return failure('UNKNOWN_TOKEN', 'Ödeme oturumu bulunamadı.');
    const { outcome, request } = checkout;
    if (outcome === 'declined') return failure('DECLINED', 'Ödeme bankanız tarafından onaylanmadı.');
    if (outcome === 'timeout') {
      return failure('PROVIDER_TIMEOUT', 'Ödeme sonucu alınamadı. Lütfen birkaç dakika sonra tekrar kontrol edin.', true);
    }
    if (!checkout.paid) {
      checkout.paid = { providerPaymentId: `fake-pay-${randomUUID()}`, providerTransactionId: `fake-tx-${randomUUID()}` };
      this.transactions.set(checkout.paid.providerTransactionId, { amountMinor: request.amountMinor });
    }
    const tamper = typeof outcome === 'object' ? outcome.tamper : null;
    return {
      ok: true,
      conversationId: tamper === 'conversationId' ? randomUUID() : request.paymentId,
      basketId: tamper === 'basketId' ? randomUUID() : request.bookingId,
      paidAmountMinor: tamper === 'amount' ? request.amountMinor - 1n : request.amountMinor,
      ...checkout.paid,
    };
  }

  async refund(providerTransactionId: string, amountMinor: bigint): Promise<RefundResult> {
    const tx = this.transactions.get(providerTransactionId);
    if (!tx) return failure('UNKNOWN_TRANSACTION', 'Ödeme bulunamadı.');
    if (amountMinor !== tx.amountMinor) return failure('INVALID_AMOUNT', 'İade tutarı ödeme tutarıyla aynı olmalı.');
    tx.refundId ??= `fake-refund-${randomUUID()}`;
    return { ok: true, providerRefundId: tx.refundId };
  }

  // ── Test and local-page helpers ──

  setOutcome(token: string, outcome: FakeOutcome) {
    const checkout = this.checkouts.get(token);
    if (!checkout) throw new Error(`Unknown fake checkout token ${token}`);
    checkout.outcome = outcome;
  }

  // Makes the next startCheckout calls fail (null restores normal behaviour).
  failStart(result: ProviderFailure | null) {
    this.startFailure = result;
  }

  // The checkout behind a token, or undefined (used by the local fake page).
  checkout(token: string) {
    return this.checkouts.get(token)?.request;
  }

  // The latest token started for a payment, for tests.
  tokenFor(paymentId: string) {
    let found: string | undefined;
    for (const [token, checkout] of this.checkouts) if (checkout.request.paymentId === paymentId) found = token;
    return found;
  }
}
