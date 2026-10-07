import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PaymentStatus, WebhookUpdate } from "../types.js";

const webhookSchema = z.object({
  reference: z.string().min(1),
  status: z.enum(["SUCCESSFUL", "FAILED"]),
  deliveryId: z.string().min(1).optional(),
});

export class MockProvider implements PaymentProvider {
  readonly name: PaymentProvider["name"];

  constructor(
    name: PaymentProvider["name"],
    private readonly outcome: "pending" | "success" | "fail",
    private readonly delayMs: number,
    private readonly approvalUrlFor?: (reference: string) => string,
  ) {
    this.name = name;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const status: PaymentStatus =
      this.outcome === "success" ? "SUCCESSFUL" : this.outcome === "fail" ? "FAILED" : "PENDING";
    return {
      status,
      providerRef: input.reference,
      approvalUrl: this.name === "paypal" ? this.approvalUrlFor?.(input.reference) : undefined,
      raw: { mode: "mock", provider: this.name, status },
    };
  }

  getStatus(providerRef: string): Promise<{ status: PaymentStatus; raw: unknown }> {
    const status: PaymentStatus =
      this.outcome === "success" ? "SUCCESSFUL" : this.outcome === "fail" ? "FAILED" : "PENDING";
    return Promise.resolve({
      status,
      raw: { mode: "mock", provider: this.name, providerRef, status },
    });
  }

  handleWebhook(_headers: IncomingHttpHeaders, body: unknown): Promise<WebhookUpdate> {
    const parsed = webhookSchema.parse(body);
    return Promise.resolve({
      providerRef: parsed.reference,
      status: parsed.status,
      deliveryId: parsed.deliveryId ?? `${this.name}:${parsed.reference}:${parsed.status}`,
      raw: parsed,
    });
  }
}
