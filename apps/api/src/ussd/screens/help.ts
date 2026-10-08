import { assertUssdLength } from "../../lib/ussdLimit.js";
import type { ScreenStep, UssdScreen } from "../types.js";

const MENU = [
  "Buy tickets with MoMo,",
  "Airtel, or PayPal.",
  "Wallet sends RWF to",
  "other numbers.",
  "0. Back",
].join("\n");

export const helpScreen: UssdScreen = {
  id: "help",
  show(): Promise<string> {
    return Promise.resolve(assertUssdLength(MENU));
  },
  onInput(input: string): Promise<ScreenStep> {
    if (input.trim() === "0") return Promise.resolve({ type: "goto", screen: "welcome" });
    return Promise.resolve({ type: "stay", notice: "Invalid choice." });
  },
};
