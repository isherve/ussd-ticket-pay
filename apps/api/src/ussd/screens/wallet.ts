import { assertUssdLength } from "../../lib/ussdLimit.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

export const walletScreen: UssdScreen = {
  id: "wallet",
  async show(ctx: ScreenContext): Promise<string> {
    const balance = await ctx.deps.walletBalance(ctx.phone);
    return assertUssdLength(
      [`Balance ${balance} RWF`, "1. Send", "2. Split", "3. Add money", "0. Back"].join("\n"),
    );
  },
  onInput(input: string): Promise<ScreenStep> {
    switch (input.trim()) {
      case "1":
        return Promise.resolve({ type: "goto", screen: "sendPhone", data: { eventPage: 0 } });
      case "2":
        return Promise.resolve({ type: "goto", screen: "splitAmount", data: { eventPage: 0 } });
      case "3":
        return Promise.resolve({ type: "goto", screen: "topupAmount", data: { eventPage: 0 } });
      case "0":
        return Promise.resolve({ type: "goto", screen: "welcome", data: { eventPage: 0 } });
      default:
        return Promise.resolve({ type: "stay", notice: "Invalid choice." });
    }
  },
};
