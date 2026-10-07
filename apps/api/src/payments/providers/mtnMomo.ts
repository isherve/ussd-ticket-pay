import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { httpRequest, readString, TokenCache } from "../http.js";
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PaymentStatus, WebhookUpdate } from "../types.js";

export type MtnOptions = {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string;
  fetchImpl?: typeof fetch;
};

const callbackSchema = z.object({
  status: z.string().optional(),
  externalId: z.string().optional(),
  referenceId: z.string().optional(),
  financialTransactionId: z.string().optional(),
  reason: z.unknown().optional(),
});

/**
 * MTN MoMo Collections sandbox.
 * Docs: https://momodeveloper.mtn.com/api-documentation
 * Token: POST /collection/token/
 * Request to pay: POST /collection/v1_0/requesttopay (202 Accepted)
 * Status: GET /collection/v1_0/requesttopay/{referenceId}
 * Callbacks are not HMAC-signed in the public docs. The route checks a secret
 * we place on X-Callback-Url. Polling remains the reliable status path.
 */
export class MtnMomoProvider implements PaymentProvider {
  readonly name = "mtn" as const;
  private readonly tokens = new TokenCache();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MtnOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const token = await this.accessToken();
    const partyId = input.phoneE164.replace(/^\+/, "");
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/collection/v1_0/requesttopay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": input.reference,
        "X-Target-Environment": this.options.targetEnvironment,
        "Ocp-Apim-Subscription-Key": this.options.subscriptionKey,
        "Content-Type": "application/json",
        ...(input.callbackUrl ? { "X-Callback-Url": input.callbackUrl } : {}),
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        externalId: input.reference,
        payer: { partyIdType: "MSISDN", partyId },
        payerMessage: input.description.slice(0, 140),
        payeeNote: "USSD Ticket Pay",
      }),
    });
    if (result.status !== 202) {
      throw new AppError("MTN MoMo could not start the payment.", 502, "mtn_request_failed");
    }
    return {
      status: "PENDING",
      providerRef: input.reference,
      raw: { httpStatus: result.status },
    };
  }

  async getStatus(providerRef: string): Promise<{ status: PaymentStatus; raw: unknown }> {
    const token = await this.accessToken();
    const result = await httpRequest(
      this.fetchImpl,
      `${this.options.baseUrl}/collection/v1_0/requesttopay/${providerRef}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Target-Environment": this.options.targetEnvironment,
          "Ocp-Apim-Subscription-Key": this.options.subscriptionKey,
        },
      },
    );
    if (result.status !== 200) {
      throw new AppError("MTN MoMo status check failed.", 502, "mtn_status_failed");
    }
    return { status: mapMtnStatus(readString(result.body, "status")), raw: result.body };
  }

  handleWebhook(_headers: IncomingHttpHeaders, body: unknown): Promise<WebhookUpdate> {
    const parsed = callbackSchema.parse(body ?? {});
    const providerRef = parsed.externalId ?? parsed.referenceId ?? parsed.financialTransactionId;
    if (!providerRef) {
      throw new AppError("MTN callback is missing a reference.", 400, "mtn_callback_invalid");
    }
    const status = mapMtnStatus(parsed.status);
    return Promise.resolve({
      providerRef,
      status,
      deliveryId: `${providerRef}:${status}:${parsed.financialTransactionId ?? "callback"}`,
      raw: parsed,
    });
  }

  private accessToken(): Promise<string> {
    return this.tokens.get(async () => {
      const basic = Buffer.from(`${this.options.apiUser}:${this.options.apiKey}`).toString("base64");
      const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/collection/token/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Ocp-Apim-Subscription-Key": this.options.subscriptionKey,
        },
      });
      const token = readString(result.body, "access_token");
      const expiresRaw = result.body && typeof result.body === "object" ? (result.body as { expires_in?: unknown }).expires_in : undefined;
      const expiresInSeconds = typeof expiresRaw === "number" ? expiresRaw : Number(expiresRaw ?? 3600);
      if (result.status !== 200 || !token) {
        throw new AppError("MTN MoMo token request failed.", 502, "mtn_token_failed");
      }
      return { token, expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600 };
    });
  }
}

export function mapMtnStatus(value: string | undefined): PaymentStatus {
  const status = (value ?? "").toUpperCase();
  if (status === "SUCCESSFUL") return "SUCCESSFUL";
  if (status === "FAILED") return "FAILED";
  if (status === "EXPIRED") return "EXPIRED";
  return "PENDING";
}
