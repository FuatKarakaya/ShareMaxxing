import Iyzipay from 'iyzipay';
import {
  formatPrice, parsePrice,
  type CheckoutResult, type PaymentProvider, type ProviderFailure, type RefundResult,
  type StartCheckoutRequest, type StartCheckoutResult,
} from './provider';

// iyzico Checkout Form on a normal sandbox account (no marketplace).
// Buyer and address details are fixed test values: real payment is out of scope.

const TIMEOUT_MS = 15_000;

const DUMMY_ADDRESS = {
  contactName: 'ShareMaxxing Öğrenci',
  city: 'Istanbul',
  country: 'Turkey',
  address: 'İTÜ Ayazağa Kampüsü, Maslak, Sarıyer',
  zipCode: '34469',
};

// iyzico error codes worth a specific Turkish message; everything else gets the generic one.
const MESSAGES: Record<string, string> = {
  '10051': 'Kartınızın bakiyesi yetersiz.',
  '10005': 'Ödeme bankanız tarafından onaylanmadı.',
  '10012': 'Geçersiz işlem.',
  '10054': 'Kartınızın son kullanma tarihi geçmiş.',
  '10084': 'Kart güvenlik kodu (CVC) hatalı.',
  '6001': 'Bu ödeme zaten iade edilmiş.',
};
const GENERIC = 'Ödeme tamamlanamadı. Lütfen tekrar deneyin.';

function declined(result: Record<string, any>): ProviderFailure {
  const code = String(result.errorCode ?? 'PAYMENT_FAILED');
  return { ok: false, failureCode: `IYZICO_${code}`, message: MESSAGES[code] ?? GENERIC, uncertain: false };
}

const unreachable: ProviderFailure = {
  ok: false,
  failureCode: 'PROVIDER_UNREACHABLE',
  message: 'Ödeme sistemine ulaşılamadı. Lütfen birkaç dakika sonra tekrar kontrol edin.',
  uncertain: true,
};

// The package has callbacks and no timeout. Network errors and timeouts are "uncertain".
function call(resource: { create?: Function; retrieve?: Function }, method: 'create' | 'retrieve', request: object) {
  return new Promise<Record<string, any> | null>(resolve => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    resource[method]!.call(resource, request, (error: unknown, result: Record<string, any>) => {
      clearTimeout(timer);
      resolve(error || !result || typeof result !== 'object' ? null : result);
    });
  });
}

export class IyzicoPaymentProvider implements PaymentProvider {
  readonly name = 'iyzico' as const;
  private readonly client: Iyzipay;

  constructor(config: { apiKey: string; secretKey: string; baseUrl: string }) {
    this.client = new Iyzipay({ apiKey: config.apiKey, secretKey: config.secretKey, uri: config.baseUrl });
  }

  async startCheckout(request: StartCheckoutRequest): Promise<StartCheckoutResult> {
    const price = formatPrice(request.amountMinor);
    const result = await call(this.client.checkoutFormInitialize, 'create', {
      locale: 'tr',
      conversationId: request.paymentId,
      price,
      paidPrice: price,
      currency: 'TRY',
      basketId: request.bookingId,
      paymentGroup: 'PRODUCT',
      callbackUrl: request.callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: request.buyerId,
        name: 'ShareMaxxing',
        surname: 'Öğrenci',
        gsmNumber: '+905350000000',
        email: 'ogrenci@example.com',
        identityNumber: '74300864791',
        registrationAddress: DUMMY_ADDRESS.address,
        ip: request.ip,
        city: DUMMY_ADDRESS.city,
        country: DUMMY_ADDRESS.country,
        zipCode: DUMMY_ADDRESS.zipCode,
      },
      shippingAddress: DUMMY_ADDRESS,
      billingAddress: DUMMY_ADDRESS,
      basketItems: [{
        id: request.bookingId,
        name: 'Yolculuk koltuğu',
        category1: 'Ulaşım',
        itemType: 'VIRTUAL',
        price,
      }],
    });
    if (!result) return unreachable;
    if (result.status !== 'success' || !result.token || !result.paymentPageUrl) return declined(result);
    return { ok: true, token: String(result.token), paymentPageUrl: String(result.paymentPageUrl) };
  }

  async getCheckoutResult(token: string): Promise<CheckoutResult> {
    const result = await call(this.client.checkoutForm, 'retrieve', { locale: 'tr', token });
    if (!result) return unreachable;
    if (result.status !== 'success' || result.paymentStatus !== 'SUCCESS') return declined(result);
    const transactionId = result.itemTransactions?.[0]?.paymentTransactionId;
    const paid = parsePrice(result.paidPrice);
    if (!result.paymentId || !transactionId || paid === null) return declined(result);
    return {
      ok: true,
      conversationId: String(result.conversationId ?? ''),
      basketId: String(result.basketId ?? ''),
      paidAmountMinor: paid,
      providerPaymentId: String(result.paymentId),
      providerTransactionId: String(transactionId),
    };
  }

  async refund(providerTransactionId: string, amountMinor: bigint): Promise<RefundResult> {
    const result = await call(this.client.refund, 'create', {
      locale: 'tr',
      paymentTransactionId: providerTransactionId,
      price: formatPrice(amountMinor),
      currency: 'TRY',
    });
    if (!result) return unreachable;
    if (result.status !== 'success') return declined(result);
    return { ok: true, providerRefundId: String(result.paymentTransactionId ?? result.paymentId ?? providerTransactionId) };
  }
}
