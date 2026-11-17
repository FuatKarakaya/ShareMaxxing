// Payment provider interface (WBS-10.1). The payment service talks only to this
// interface, so tests and CI use the fake adapter and never call iyzico.
// Payments use iyzico's hosted Checkout Form on a normal sandbox account (no
// marketplace). HOLD and RELEASE are application states kept in the ledger.
// Amounts are TL in minor units (kuruş); the currency is always TRY.

export type StartCheckoutRequest = {
  // payments.id, sent to iyzico as conversationId and checked again on the callback.
  paymentId: string;
  // bookings.id, sent to iyzico as basketId.
  bookingId: string;
  amountMinor: bigint;
  buyerId: string;
  ip: string;
  // Where iyzico sends the user's browser back with the checkout token.
  callbackUrl: string;
};

export type ProviderFailure = {
  ok: false;
  failureCode: string;
  // Turkish message that can be shown to the user (FR-20).
  message: string;
  // true when the outcome is unknown (network error or timeout). The payment
  // stays PENDING and is reconciled before any retry (database plan §4.3).
  uncertain: boolean;
};

export type StartCheckoutResult =
  | { ok: true; token: string; paymentPageUrl: string }
  | ProviderFailure;

export type CheckoutResult =
  | {
    ok: true;
    conversationId: string;
    basketId: string;
    paidAmountMinor: bigint;
    providerPaymentId: string;
    // The item transaction ID; refunds use it.
    providerTransactionId: string;
  }
  | ProviderFailure;

export type RefundResult = { ok: true; providerRefundId: string } | ProviderFailure;

export interface PaymentProvider {
  readonly name: 'fake' | 'iyzico';
  // Creates a hosted payment page for one payment attempt.
  startCheckout(request: StartCheckoutRequest): Promise<StartCheckoutResult>;
  // Reads the verified result of a checkout. Never trust the browser callback alone.
  getCheckoutResult(token: string): Promise<CheckoutResult>;
  // Returns a held payment to the payer in full (WBS-11.1).
  refund(providerTransactionId: string, amountMinor: bigint): Promise<RefundResult>;
}

// kuruş → "400.00", the price format iyzico expects.
export function formatPrice(amountMinor: bigint): string {
  const lira = amountMinor / 100n;
  const kurus = (amountMinor % 100n).toString().padStart(2, '0');
  return `${lira}.${kurus}`;
}

// "400.0" / "400" / "400.00" → 40000n. Returns null for anything that is not a plain TL amount.
export function parsePrice(value: unknown): bigint | null {
  const text = typeof value === 'number' ? value.toFixed(2) : value;
  if (typeof text !== 'string' || !/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [lira, kurus = ''] = text.split('.');
  return BigInt(lira) * 100n + BigInt(kurus.padEnd(2, '0'));
}
