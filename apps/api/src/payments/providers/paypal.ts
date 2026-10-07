import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { headerValue } from "../../lib/secret.js";
import { asRecord, httpRequest, readString, TokenCache } from "../http.js";
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PaymentStatus, WebhookUpdate } from "../types.js";

export type PaypalOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  returnUrl: string;
  cancelUrl: string;
  fetchImpl?: typeof fetch;
};

/**
 * PayPal Orders v2 sandbox.
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 * Token: POST /v1/oauth2/token
 * Create: POST /v2/checkout/orders
 * Capture: POST /v2/checkout/orders/{id}/capture
 * Approve link rel is "approve", or "payer-action" when payment_source is set.
 * Webhook verify: POST /v1/notifications/verify-webhook-signature
 */
export class PayPalProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  private readonly tokens = new TokenCache();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: PaypalOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const token = await this.accessToken();
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.publicReference,
            custom_id: input.publicReference,
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: input.amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: this.options.returnUrl,
              cancel_url: this.options.cancelUrl,
              user_action: "PAY_NOW",
              brand_name: "USSD Ticket Pay",
            },
          },
        },
      }),
    });
    const orderId = readString(result.body, "id");
    if ((result.status !== 200 && result.status !== 201) || !orderId) {
      throw new AppError("PayPal could not start the payment.", 502, "paypal_request_failed");
    }
    return {
      status: "PENDING",
      providerRef: orderId,
      approvalUrl: approvalLink(result.body),
      raw: { id: orderId, status: readString(result.body, "status") },
    };
  }

  async getStatus(providerRef: string): Promise<{ status: PaymentStatus; raw: unknown }> {
    const order = await this.getOrder(providerRef);
    const orderStatus = readString(order, "status") ?? "";
    if (orderStatus === "APPROVED") {
      const captured = await this.capture(providerRef);
      return { status: mapPaypalOrder(readString(captured, "status")), raw: captured };
    }
    return { status: mapPaypalOrder(orderStatus), raw: order };
  }

  async handleWebhook(headers: IncomingHttpHeaders, body: unknown): Promise<WebhookUpdate> {
    if (this.options.webhookId) {
      await this.verifySignature(headers, body);
    }
    const event = z
      .object({
        id: z.string().optional(),
        event_type: z.string(),
        resource: z.unknown().optional(),
      })
      .parse(body);
    const resource = asRecord(event.resource);
    if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const orderId = readString(resource, "id");
      if (!orderId) throw new AppError("PayPal event is missing an order id.", 400, "paypal_event_invalid");
      const captured = await this.capture(orderId);
      return {
        providerRef: orderId,
        status: mapPaypalOrder(readString(captured, "status")),
        deliveryId: event.id ?? `${orderId}:approved`,
        raw: event,
      };
    }
    const providerRef = paypalReference(resource);
    if (!providerRef) throw new AppError("PayPal event is missing a reference.", 400, "paypal_event_invalid");
    const status =
      event.event_type === "PAYMENT.CAPTURE.COMPLETED"
        ? "SUCCESSFUL"
        : event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.REFUNDED"
          ? "FAILED"
          : "PENDING";
    return {
      providerRef,
      status,
      deliveryId: event.id ?? `${providerRef}:${event.event_type}`,
      raw: event,
    };
  }

  async capture(orderId: string): Promise<unknown> {
    const token = await this.accessToken();
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });
    if (result.status !== 200 && result.status !== 201) {
      throw new AppError("PayPal capture failed.", 502, "paypal_capture_failed");
    }
    return result.body;
  }

  private async getOrder(orderId: string): Promise<unknown> {
    const token = await this.accessToken();
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status !== 200) throw new AppError("PayPal status check failed.", 502, "paypal_status_failed");
    return result.body;
  }

  private async verifySignature(headers: IncomingHttpHeaders, body: unknown): Promise<void> {
    const token = await this.accessToken();
    const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headerValue(headers, "paypal-auth-algo"),
        cert_url: headerValue(headers, "paypal-cert-url"),
        transmission_id: headerValue(headers, "paypal-transmission-id"),
        transmission_sig: headerValue(headers, "paypal-transmission-sig"),
        transmission_time: headerValue(headers, "paypal-transmission-time"),
        webhook_id: this.options.webhookId,
        webhook_event: body,
      }),
    });
    if (readString(result.body, "verification_status") !== "SUCCESS") {
      throw new AppError("PayPal webhook signature was rejected.", 401, "paypal_signature_invalid");
    }
  }

  private accessToken(): Promise<string> {
    return this.tokens.get(async () => {
      const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64");
      const result = await httpRequest(this.fetchImpl, `${this.options.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const token = readString(result.body, "access_token");
      const expiresRaw = asRecord(result.body)?.expires_in;
      const expiresInSeconds = typeof expiresRaw === "number" ? expiresRaw : Number(expiresRaw ?? 300);
      if (!token) throw new AppError("PayPal token request failed.", 502, "paypal_token_failed");
      return { token, expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : 300 };
    });
  }
}

export function approvalLink(body: unknown): string | undefined {
  const links = asRecord(body)?.links;
  if (!Array.isArray(links)) return undefined;
  for (const link of links) {
    const record = asRecord(link);
    const rel = readString(record, "rel");
    const href = readString(record, "href");
    if (href && (rel === "approve" || rel === "payer-action")) return href;
  }
  return undefined;
}

export function mapPaypalOrder(status: string | undefined): PaymentStatus {
  const value = (status ?? "").toUpperCase();
  if (value === "COMPLETED") return "SUCCESSFUL";
  if (value === "VOIDED" || value === "DENIED") return "FAILED";
  return "PENDING";
}

/** Prefer the PayPal order id, then the custom_id we set to the public reference. */
export function paypalReference(resource: Record<string, unknown> | null): string | undefined {
  const related = asRecord(asRecord(resource?.supplementary_data)?.related_ids);
  const orderId = readString(related, "order_id");
  if (orderId) return orderId;
  const custom = readString(resource, "custom_id");
  if (custom) return custom;
  const units = resource?.purchase_units;
  if (Array.isArray(units)) {
    const first = asRecord(units[0]);
    const fromUnit = readString(first, "custom_id") ?? readString(first, "reference_id");
    if (fromUnit) return fromUnit;
  }
  return readString(resource, "id");
}
