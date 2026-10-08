import { assertUssdLength } from "../../lib/ussdLimit.js";
import { parseWalletAmount } from "../../wallet/service.js";
import type { ScreenStep, UssdScreen } from "../types.js";

export const splitAmountScreen: UssdScreen = {
  id: "splitAmount",
  show(): Promise<string> {
    return Promise.resolve(
      assertUssdLength(["Split an amount", "equally. RWF:", "0. Back"].join("\n")),
    );
  },
  onInput(input: string): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0")
      return Promise.resolve({ type: "goto", screen: "wallet", data: { eventPage: 0 } });
    const amount = parseWalletAmount(text);
    if (amount === null) return Promise.resolve({ type: "stay", notice: "Enter 1-1000000." });
    return Promise.resolve({
      type: "goto",
      screen: "splitPeople",
      data: { eventPage: 0, walletAmount: amount, recipients: [] },
    });
  },
};
