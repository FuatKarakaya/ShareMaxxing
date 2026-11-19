import { FakePaymentProvider } from './fake-provider';
import { IyzicoPaymentProvider } from './iyzico-provider';
import type { PaymentProvider } from './provider';

export type { PaymentProvider } from './provider';
export { FakePaymentProvider } from './fake-provider';

// PAYMENT_PROVIDER=fake (default outside production) or iyzico.
// Production never falls back to the fake provider.
export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const production = env.NODE_ENV === 'production';
  const choice = env.PAYMENT_PROVIDER ?? (production ? 'iyzico' : 'fake');

  if (choice === 'fake') {
    if (production) throw new Error('The fake payment provider cannot run in production.');
    return new FakePaymentProvider();
  }
  if (choice === 'iyzico') {
    const { IYZICO_API_KEY: apiKey, IYZICO_SECRET_KEY: secretKey, IYZICO_BASE_URL: baseUrl } = env;
    if (!apiKey || !secretKey || !baseUrl) {
      throw new Error('iyzico configuration is missing (IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL).');
    }
    return new IyzicoPaymentProvider({ apiKey, secretKey, baseUrl });
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${choice}". Use "fake" or "iyzico".`);
}
