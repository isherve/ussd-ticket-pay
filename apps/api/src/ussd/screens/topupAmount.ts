import { assertUssdLength } from "../../lib/ussdLimit.js";
import { parseWalletAmount, ussdTransferKey } from "../../wallet/service.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";
import { endWalletError } from "./walletEnd.js";

export const topupAmountScreen: UssdScreen = {
  id: "topupAmount",
  show(): Promise<string> {
    return Promise.resolve(assertUssdLength(["Add money", "Amount in RWF", "0. Back"].join("\n")));
  },
  async onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0") {
      return { type: "goto", screen: "wallet", data: { eventPage: 0 } };
    }
    const amount = parseWalletAmount(text);
    if (amount === null) return { type: "stay", notice: "Enter 1-1000000." };
    try {
      const move = await ctx.deps.walletTopUp({
        phone: ctx.phone,
        amountRwf: amount,
        idempotencyKey: ussdTransferKey("topup", ctx.requestKey),
      });
      const lead = move.duplicate ? "Already added." : `Added ${move.amountRwf} RWF`;
      return {
        type: "end",
        message: `${lead}\nBalance ${move.balanceRwf}\nRef: ${move.reference}`,
      };
    } catch (error) {
      return endWalletError(error);
    }
  },
};
