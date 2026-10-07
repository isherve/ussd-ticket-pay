import type { IncomingHttpHeaders } from "node:http";

export const paymentStatuses = ["PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export type ProviderName = "mtn" | "airtel" | "paypal";

export type InitiatePaymentInput = {
  /** Provider idempotency key. MTN uses this as X-Reference-Id and externalId. */
  reference: string;
  /** Short code shown to the payer. PayPal stores it as custom_id. */
  publicReference: string;
  amount: string;
  currency: string;
  phoneE164: string;
  description: string;
  callbackUrl?: string;
};

export type InitiatePaymentResult = {
  status: PaymentStatus;
  providerRef: string;
  approvalUrl?: string;
  raw: unknown;
};

export type WebhookUpdate = {
  providerRef: string;
  status: PaymentStatus;
  deliveryId: string;
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: ProviderName;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  getStatus(providerRef: string): Promise<{ status: PaymentStatus; raw: unknown }>;
  handleWebhook(headers: IncomingHttpHeaders, body: unknown): Promise<WebhookUpdate>;
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return value === "PENDING" || value === "SUCCESSFUL" || value === "FAILED" || value === "EXPIRED";
}
