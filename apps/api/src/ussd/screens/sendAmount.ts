import { assertUssdLength } from "../../lib/ussdLimit.js";
import { maskPhone } from "../../lib/phone.js";
import { parseWalletAmount } from "../../wallet/service.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

export const sendAmountScreen: UssdScreen = {
  id: "sendAmount",
  show(ctx: ScreenContext): Promise<string> {
    const to = ctx.data.recipients?.[0] ?? "";
    return Promise.resolve(
      assertUssdLength([`To ${maskPhone(to)}`, "Amount in RWF", "0. Back"].join("\n")),
    );
  },
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0") {
      return Promise.resolve({ type: "goto", screen: "sendPhone", data: { eventPage: 0 } });
    }
    const amount = parseWalletAmount(text);
    if (amount === null) return Promise.resolve({ type: "stay", notice: "Enter 1-1000000." });
    return Promise.resolve({
      type: "goto",
      screen: "sendConfirm",
      data: { ...ctx.data, walletAmount: amount },
    });
  },
};
