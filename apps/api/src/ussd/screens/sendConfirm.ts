import { assertUssdLength } from "../../lib/ussdLimit.js";
import { maskPhone } from "../../lib/phone.js";
import { ussdTransferKey } from "../../wallet/service.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";
import { endWalletError } from "./walletEnd.js";

export const sendConfirmScreen: UssdScreen = {
  id: "sendConfirm",
  show(ctx: ScreenContext): Promise<string> {
    const to = ctx.data.recipients?.[0] ?? "";
    return Promise.resolve(
      assertUssdLength(
        [
          `Send ${ctx.data.walletAmount ?? 0} RWF`,
          `to ${maskPhone(to)}`,
          "1. Confirm",
          "0. Back",
        ].join("\n"),
      ),
    );
  },
  async onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0") return { type: "goto", screen: "sendAmount", data: ctx.data };
    if (text !== "1") return { type: "stay", notice: "Invalid choice." };
    const toPhone = ctx.data.recipients?.[0];
    const amountRwf = ctx.data.walletAmount;
    if (!toPhone || !amountRwf) return { type: "end", message: "Start the send again." };
    try {
      const move = await ctx.deps.walletSend({
        fromPhone: ctx.phone,
        toPhone,
        amountRwf,
        idempotencyKey: ussdTransferKey("send", ctx.requestKey),
      });
      const lead = move.duplicate ? "Already sent." : `Sent ${move.amountRwf} RWF`;
      return {
        type: "end",
        message: `${lead}\nBalance ${move.balanceRwf}\nRef: ${move.reference}`,
      };
    } catch (error) {
      return endWalletError(error);
    }
  },
};
