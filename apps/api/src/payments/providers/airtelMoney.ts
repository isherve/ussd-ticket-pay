import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { asRecord, httpRequest, readString, TokenCache } from "../http.js";
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PaymentStatus, WebhookUpdate } from "../types.js";

export type AirtelOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  country: string;
  currency: string;
  fetchImpl?: typeof fetch;
};

/**
 * Airtel Money collection (USSD push), v1.
 * Auth: POST /auth/oauth2/token
 * Collect: POST /merchant/v1/payments/
 * Enquiry: GET /standard/v1/payments/{id}
 * Sandbox host commonly used by Airtel: https://openapiuat.airtel.africa
 * Status codes TS / TF / TIP / TA are the ones published in Airtel collection
 * examples and community SDKs. The callback wrapper differs by market; the
 * parser accepts the enquiry shape and a flat transaction object.
 */
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = "airtel" as const;
  private readonly tokens = new TokenCache();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AirtelOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const token = await this.accessToken();
    const msisdn = input.phoneE164.replace(/^\+?250/, "").replace(/^\+/, "");
    const amount = Number(input.amount);
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/merchant/v1/payments/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-Country": this.options.country,
        "X-Currency": input.currency || this.options.currency,
      },
      body: JSON.stringify({
        reference: input.description.slice(0, 32),
        subscriber: {
          country: this.options.country,
          currency: input.currency || this.options.currency,
          msisdn,
        },
        transaction: {
          amount: Number.isFinite(amount) ? Math.round(amount) : 0,
          country: this.options.country,
          currency: input.currency || this.options.currency,
          id: input.reference,
        },
      }),
    });
    if (result.status < 200 || result.status >= 300) {
      throw new AppError("Airtel Money could not start the payment.", 502, "airtel_request_failed");
    }
    return { status: "PENDING", providerRef: input.reference, raw: result.body };
  }

  async getStatus(providerRef: string): Promise<{ status: PaymentStatus; raw: unknown }> {
    const token = await this.accessToken();
    const result = await httpRequest(
      this.fetchImpl,
      `${this.options.baseUrl}/standard/v1/payments/${encodeURIComponent(providerRef)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "*/*",
          "X-Country": this.options.country,
          "X-Currency": this.options.currency,
        },
      },
    );
    if (result.status < 200 || result.status >= 300) {
      throw new AppError("Airtel Money status check failed.", 502, "airtel_status_failed");
    }
    return { status: mapAirtelStatus(extractAirtelStatus(result.body)), raw: result.body };
  }

  handleWebhook(_headers: IncomingHttpHeaders, body: unknown): Promise<WebhookUpdate> {
    const parsed = z.object({}).passthrough().parse(body ?? {});
    const providerRef = extractAirtelId(parsed);
    if (!providerRef) {
      throw new AppError("Airtel callback is missing a transaction id.", 400, "airtel_callback_invalid");
    }
    const status = mapAirtelStatus(extractAirtelStatus(parsed));
    return Promise.resolve({
      providerRef,
      status,
      deliveryId: `${providerRef}:${status}`,
      raw: parsed,
    });
  }

  private accessToken(): Promise<string> {
    return this.tokens.get(async () => {
      const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/auth/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          grant_type: "client_credentials",
        }),
      });
      const token = readString(result.body, "access_token");
      const expiresRaw = asRecord(result.body)?.expires_in;
      const expiresInSeconds = typeof expiresRaw === "number" ? expiresRaw : Number(expiresRaw ?? 180);
      if (!token) throw new AppError("Airtel Money token request failed.", 502, "airtel_token_failed");
      return { token, expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : 180 };
    });
  }
}

export function mapAirtelStatus(value: string | undefined): PaymentStatus {
  const status = (value ?? "").toUpperCase();
  if (status === "TS" || status === "SUCCESS" || status === "SUCCESSFUL") return "SUCCESSFUL";
  if (status === "TF" || status === "FAILED" || status === "FAIL") return "FAILED";
  if (status === "EXPIRED") return "EXPIRED";
  return "PENDING";
}

export function extractAirtelStatus(body: unknown): string | undefined {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  const transaction = asRecord(data?.transaction) ?? asRecord(root?.transaction);
  return (
    readString(transaction, "status_code") ??
    readString(transaction, "status") ??
    readString(data, "status") ??
    readString(root, "status")
  );
}

function extractAirtelId(body: unknown): string | undefined {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  const transaction = asRecord(data?.transaction) ?? asRecord(root?.transaction);
  return (
    readString(transaction, "id") ??
    readString(transaction, "airtel_money_id") ??
    readString(root, "id") ??
    readString(data, "id")
  );
}
