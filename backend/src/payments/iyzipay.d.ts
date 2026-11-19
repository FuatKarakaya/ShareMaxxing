// Minimal types for the parts of the official iyzipay package this project uses.
declare module 'iyzipay' {
  type Callback = (error: unknown, result: Record<string, any>) => void;
  type Resource = { create(request: object, cb: Callback): void; retrieve(request: object, cb: Callback): void };

  class Iyzipay {
    constructor(config: { apiKey: string; secretKey: string; uri: string });
    checkoutFormInitialize: Resource;
    checkoutForm: Resource;
    refund: Resource;
  }

  export = Iyzipay;
}
