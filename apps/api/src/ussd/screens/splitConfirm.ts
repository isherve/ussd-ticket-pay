import { assertUssdLength } from "../../lib/ussdLimit.js";
import { quoteSplit, ussdTransferKey } from "../../wallet/service.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";
import { endWalletError } from "./walletEnd.js";

export const splitConfirmScreen: UssdScreen = {
  id: "splitConfirm",
  show(ctx: ScreenContext): Promise<string> {
    const count = ctx.data.recipients?.length ?? 0;
    const quote = quoteSplit(ctx.data.walletAmount ?? 0, count);
    if (!quote) return Promise.resolve(assertUssdLength("Amount too small.\n0. Back"));
    return Promise.resolve(
      assertUssdLength(
        [
          `${quote.debitRwf} RWF / ${count}`,
          `${quote.shareRwf} each`,
          `Remainder ${quote.remainderRwf} stays`,
          "1. Confirm",
          "0. Back",
        ].join("\n"),
      ),
    );
  },
  async onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0") return { type: "goto", screen: "splitPeople", data: ctx.data };
    if (text !== "1") return { type: "stay", notice: "Invalid choice." };
    const phones = ctx.data.recipients ?? [];
    const amountRwf = ctx.data.walletAmount;
    if (!amountRwf || phones.length < 2) return { type: "end", message: "Start the split again." };
    try {
      const move = await ctx.deps.walletSplit({
        fromPhone: ctx.phone,
        amountRwf,
        phones,
        idempotencyKey: ussdTransferKey("split", ctx.requestKey),
      });
      const lead = move.duplicate ? "Already split." : `Split ${move.amountRwf} RWF`;
      return {
        type: "end",
        message: `${lead}\n${move.shareRwf} each\nBalance ${move.balanceRwf}\nRef: ${move.reference}`,
      };
    } catch (error) {
      return endWalletError(error);
    }
  },
};
