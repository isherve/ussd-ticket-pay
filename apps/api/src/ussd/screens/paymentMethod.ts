import { assertUssdLength } from "../../lib/ussdLimit.js";
import type { PaymentChoice, ScreenContext, ScreenStep, UssdScreen } from "../types.js";

const choices: Record<string, PaymentChoice> = {
  "1": "mtn",
  "2": "airtel",
  "3": "paypal",
  "4": "wallet",
};

export const paymentScreen: UssdScreen = {
  id: "payment",
  async show(ctx: ScreenContext): Promise<string> {
    const suggested = ctx.network === "mtn" ? "MTN" : "Airtel";
    const balance = await ctx.deps.walletBalance(ctx.phone);
    return assertUssdLength(
      [
        `Suggested: ${suggested}`,
        `Wallet ${balance} RWF`,
        "1. MTN MoMo",
        "2. Airtel Money",
        "3. PayPal",
        "4. Wallet",
        "0. Back",
      ].join("\n"),
    );
  },
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const choice = input.trim();
    if (choice === "0") {
      return Promise.resolve({
        type: "goto",
        screen: "quantity",
        data: { ...ctx.data, provider: undefined },
      });
    }
    const provider = choices[choice];
    if (!provider) return Promise.resolve({ type: "stay", notice: "Invalid choice." });
    return Promise.resolve({
      type: "goto",
      screen: "confirm",
      data: { ...ctx.data, provider },
    });
  },
};
