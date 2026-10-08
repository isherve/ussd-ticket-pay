import { AppError } from "../../lib/errors.js";
import { assertUssdLength, clip } from "../../lib/ussdLimit.js";
import { ussdTransferKey } from "../../wallet/service.js";
import type { PaymentChoice, ScreenContext, ScreenStep, UssdScreen } from "../types.js";

function providerLabel(provider: PaymentChoice): string {
  if (provider === "mtn") return "MTN MoMo";
  if (provider === "airtel") return "Airtel Money";
  if (provider === "wallet") return "Wallet";
  return "PayPal";
}

export const confirmScreen: UssdScreen = {
  id: "confirm",
  show(ctx: ScreenContext): Promise<string> {
    const qty = ctx.data.quantity ?? 0;
    const unit = ctx.data.unitPriceRwf ?? 0;
    const provider = ctx.data.provider ?? "mtn";
    const lines = [
      clip(ctx.data.eventName ?? "Event", 18),
      `Qty ${qty}`,
      `Total ${unit * qty} RWF`,
      `Via ${providerLabel(provider)}`,
    ];
    if ((provider === "mtn" || provider === "airtel") && provider !== ctx.network) {
      lines.push(ctx.network === "mtn" ? "Line is MTN" : "Line is Airtel");
    }
    lines.push("1. Confirm", "2. Cancel");
    return Promise.resolve(assertUssdLength(lines.join("\n")));
  },
  async onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const choice = input.trim();
    if (choice === "2") return { type: "end", message: "Payment cancelled." };
    if (choice !== "1") return { type: "stay", notice: "Invalid choice." };
    const { eventId, quantity, provider } = ctx.data;
    if (!eventId || !quantity || !provider) {
      return { type: "goto", screen: "welcome", notice: "Start again." };
    }
    try {
      const result = await ctx.deps.startPayment({
        phone: ctx.phone,
        eventId,
        quantity,
        provider,
        idempotencyKey: ussdTransferKey("ticket", ctx.requestKey),
      });
      if (result.ticketCode) {
        const lead = result.duplicate ? "Already paid." : "Paid from wallet.";
        return {
          type: "end",
          message: `${lead}\nCode ${result.ticketCode}\nRef: ${result.reference}`,
        };
      }
      return {
        type: "end",
        message: `Check your phone to approve the payment. Ref: ${result.reference}`,
      };
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Payment could not start.";
      return { type: "end", message: clip(message, 160) };
    }
  },
};
