import { assertUssdLength } from "../../lib/ussdLimit.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

const MENU = [
  "USSD Ticket Pay",
  "1. Buy ticket",
  "2. My tickets",
  "3. Wallet",
  "4. Help",
  "0. Exit",
].join("\n");

export const welcomeScreen: UssdScreen = {
  id: "welcome",
  show(_ctx: ScreenContext): Promise<string> {
    return Promise.resolve(assertUssdLength(MENU));
  },
  onInput(input: string): Promise<ScreenStep> {
    switch (input.trim()) {
      case "1":
        return Promise.resolve({ type: "goto", screen: "events", data: { eventPage: 0 } });
      case "2":
        return Promise.resolve({ type: "goto", screen: "tickets" });
      case "3":
        return Promise.resolve({ type: "goto", screen: "wallet", data: { eventPage: 0 } });
      case "4":
        return Promise.resolve({ type: "goto", screen: "help" });
      case "0":
        return Promise.resolve({ type: "end", message: "Goodbye. Dial again anytime." });
      default:
        return Promise.resolve({ type: "stay", notice: "Invalid choice." });
    }
  },
};
