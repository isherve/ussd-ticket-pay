import { config } from "../config.js";
import type { PaymentProvider, ProviderName } from "./types.js";
import { AirtelMoneyProvider } from "./providers/airtelMoney.js";
import { MockProvider } from "./providers/mock.js";
import { MtnMomoProvider } from "./providers/mtnMomo.js";
import { PayPalProvider } from "./providers/paypal.js";

function mockFor(name: ProviderName): PaymentProvider {
  return new MockProvider(
    name,
    config.mockPaymentResult,
    config.mockPaymentDelayMs,
    (reference) => `${config.webAppUrl}/pay/mock?ref=${encodeURIComponent(reference)}`,
  );
}

const providers = new Map<string, PaymentProvider>();

export function getProvider(name: ProviderName): PaymentProvider {
  const key = `${name}:${providerMode(name)}`;
  const cached = providers.get(key);
  if (cached) return cached;
  const created = buildProvider(name);
  providers.set(key, created);
  return created;
}

function buildProvider(name: ProviderName): PaymentProvider {
  if (name === "mtn") {
    if (config.mtnMode === "mock") return mockFor("mtn");
    return new MtnMomoProvider({
      baseUrl: config.momoBaseUrl,
      subscriptionKey: config.momoSubscriptionKey,
      apiUser: config.momoApiUser,
      apiKey: config.momoApiKey,
      targetEnvironment: config.momoTargetEnv,
    });
  }
  if (name === "airtel") {
    if (config.airtelMode === "mock") return mockFor("airtel");
    return new AirtelMoneyProvider({
      baseUrl: config.airtelBaseUrl,
      clientId: config.airtelClientId,
      clientSecret: config.airtelClientSecret,
      country: config.airtelCountry,
      currency: config.airtelCurrency,
    });
  }
  if (config.paypalMode === "mock") return mockFor("paypal");
  return new PayPalProvider({
    baseUrl: config.paypalBaseUrl,
    clientId: config.paypalClientId,
    clientSecret: config.paypalClientSecret,
    webhookId: config.paypalWebhookId,
    returnUrl: `${config.publicBaseUrl}/payments/paypal/return`,
    cancelUrl: `${config.publicBaseUrl}/payments/paypal/cancel`,
  });
}

export function providerMode(name: ProviderName): "mock" | "sandbox" {
  if (name === "mtn") return config.mtnMode;
  if (name === "airtel") return config.airtelMode;
  return config.paypalMode;
}

export function callbackUrl(name: ProviderName): string | undefined {
  if (name === "mtn") {
    return `${config.publicBaseUrl}/webhooks/mtn?token=${encodeURIComponent(config.webhookSecret)}`;
  }
  if (name === "airtel") return `${config.publicBaseUrl}/webhooks/airtel`;
  return undefined;
}
