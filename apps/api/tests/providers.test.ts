import { describe, expect, it } from "vitest";
import { AirtelMoneyProvider } from "../src/payments/providers/airtelMoney.js";
import { MtnMomoProvider } from "../src/payments/providers/mtnMomo.js";
import { PayPalProvider } from "../src/payments/providers/paypal.js";

type Call = { url: string; init: RequestInit | undefined };

function mockFetch(handler: (call: Call, index: number) => Response): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetchImpl, calls };
}

describe("MTN MoMo sandbox adapter", () => {
  it("caches the OAuth token and posts RequestToPay with the sandbox headers", async () => {
    const { fetchImpl, calls } = mockFetch((call) => {
      if (call.url.endsWith("/collection/token/")) {
        return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
      }
      return new Response(null, { status: 202 });
    });
    const provider = new MtnMomoProvider({
      baseUrl: "https://sandbox.momodeveloper.mtn.com",
      subscriptionKey: "sub-key",
      apiUser: "user-1",
      apiKey: "key-1",
      targetEnvironment: "sandbox",
      fetchImpl,
    });
    const input = {
      reference: "11111111-1111-1111-1111-111111111111",
      publicReference: "AB12CD34",
      amount: "4",
      currency: "EUR",
      phoneE164: "+250788123456",
      description: "Tickets Jazz Night",
      callbackUrl: "https://example.test/webhooks/mtn?token=secret",
    };
    await provider.initiatePayment(input);
    await provider.initiatePayment({ ...input, reference: "22222222-2222-2222-2222-222222222222" });

    const tokenCalls = calls.filter((call) => call.url.endsWith("/collection/token/"));
    expect(tokenCalls).toHaveLength(1);
    const pay = calls.find((call) => call.url.endsWith("/collection/v1_0/requesttopay"));
    expect(pay?.init?.method).toBe("POST");
    const headers = pay?.init?.headers as Record<string, string>;
    expect(headers["X-Target-Environment"]).toBe("sandbox");
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("sub-key");
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["X-Reference-Id"]).toBe(input.reference);
    const body = JSON.parse(String(pay?.init?.body)) as { currency: string; payer: { partyId: string } };
    expect(body.currency).toBe("EUR");
    expect(body.payer.partyId).toBe("250788123456");
  });
});

describe("Airtel Money adapter", () => {
  it("sends a USSD push to the collection endpoint", async () => {
    const { fetchImpl, calls } = mockFetch((call) => {
      if (call.url.endsWith("/auth/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "airtel-tok", expires_in: 180 }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: { success: true } }), { status: 200 });
    });
    const provider = new AirtelMoneyProvider({
      baseUrl: "https://openapiuat.airtel.africa",
      clientId: "id",
      clientSecret: "secret",
      country: "UG",
      currency: "UGX",
      fetchImpl,
    });
    await provider.initiatePayment({
      reference: "tx-1",
      publicReference: "AB12CD34",
      amount: "5000",
      currency: "UGX",
      phoneE164: "+250728123456",
      description: "Tickets",
    });
    const pay = calls.find((call) => call.url.endsWith("/merchant/v1/payments/"));
    const headers = pay?.init?.headers as Record<string, string>;
    expect(headers["X-Country"]).toBe("UG");
    expect(headers["X-Currency"]).toBe("UGX");
    const body = JSON.parse(String(pay?.init?.body)) as {
      subscriber: { msisdn: string };
      transaction: { id: string; amount: number };
    };
    expect(body.subscriber.msisdn).toBe("728123456");
    expect(body.transaction.id).toBe("tx-1");
    expect(body.transaction.amount).toBe(5000);
  });
});

describe("PayPal Orders v2 adapter", () => {
  it("creates a sandbox order and reads the approval link", async () => {
    const { fetchImpl, calls } = mockFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "pp", expires_in: 300 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "ORDER1",
          status: "PAYER_ACTION_REQUIRED",
          links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1" }],
        }),
        { status: 201 },
      );
    });
    const provider = new PayPalProvider({
      baseUrl: "https://api-m.sandbox.paypal.com",
      clientId: "client",
      clientSecret: "secret",
      webhookId: "",
      returnUrl: "http://localhost:3000/payments/paypal/return",
      cancelUrl: "http://localhost:3000/payments/paypal/cancel",
      fetchImpl,
    });
    const result = await provider.initiatePayment({
      reference: "uuid",
      publicReference: "AB12CD34",
      amount: "3.85",
      currency: "USD",
      phoneE164: "+250788123456",
      description: "Tickets",
    });
    expect(result.providerRef).toBe("ORDER1");
    expect(result.approvalUrl).toContain("sandbox.paypal.com");
    const orderCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"));
    const body = JSON.parse(String(orderCall?.init?.body)) as {
      intent: string;
      purchase_units: Array<{ custom_id: string; amount: { currency_code: string; value: string } }>;
    };
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]?.custom_id).toBe("AB12CD34");
    expect(body.purchase_units[0]?.amount).toEqual({ currency_code: "USD", value: "3.85" });
  });
});
