import { assertUssdLength } from "../../lib/ussdLimit.js";
import { normalizeRwandaPhone } from "../../lib/phone.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

export const sendPhoneScreen: UssdScreen = {
  id: "sendPhone",
  show(): Promise<string> {
    return Promise.resolve(assertUssdLength(["Send money", "Enter phone", "0. Back"].join("\n")));
  },
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    if (text === "0")
      return Promise.resolve({ type: "goto", screen: "wallet", data: { eventPage: 0 } });
    const phone = normalizeRwandaPhone(text);
    if (!phone) return Promise.resolve({ type: "stay", notice: "Enter a Rwandan number." });
    if (phone.e164 === ctx.phone)
      return Promise.resolve({ type: "stay", notice: "Use another number." });
    return Promise.resolve({
      type: "goto",
      screen: "sendAmount",
      data: { eventPage: 0, recipients: [phone.e164] },
    });
  },
};
