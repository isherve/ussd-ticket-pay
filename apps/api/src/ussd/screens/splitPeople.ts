import { assertUssdLength } from "../../lib/ussdLimit.js";
import { maskPhone, normalizeRwandaPhone } from "../../lib/phone.js";
import { WALLET_MAX_SPLIT } from "../../wallet/service.js";
import type { ScreenContext, ScreenStep, SessionData, UssdScreen } from "../types.js";

function peopleBody(data: SessionData): string {
  const people = data.recipients ?? [];
  const listed =
    people.length > 0 ? people.map((phone) => maskPhone(phone)).join("\n") : "No people yet";
  return assertUssdLength(
    [`Split ${data.walletAmount ?? 0} RWF`, listed, "Enter a phone", "1. Review", "0. Back"].join(
      "\n",
    ),
  );
}

export const splitPeopleScreen: UssdScreen = {
  id: "splitPeople",
  show(ctx: ScreenContext): Promise<string> {
    return Promise.resolve(peopleBody(ctx.data));
  },
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const text = input.trim();
    const recipients = ctx.data.recipients ?? [];
    if (text === "0") {
      return Promise.resolve({
        type: "goto",
        screen: "splitAmount",
        data: { eventPage: 0, walletAmount: ctx.data.walletAmount },
      });
    }
    if (text === "1") {
      if (recipients.length < 2)
        return Promise.resolve({ type: "stay", notice: "Add at least 2." });
      return Promise.resolve({ type: "goto", screen: "splitConfirm", data: ctx.data });
    }
    const phone = normalizeRwandaPhone(text);
    if (!phone) return Promise.resolve({ type: "stay", notice: "Enter a Rwandan number." });
    if (phone.e164 === ctx.phone)
      return Promise.resolve({ type: "stay", notice: "Use another number." });
    if (recipients.includes(phone.e164))
      return Promise.resolve({ type: "stay", notice: "Already added." });
    if (recipients.length >= WALLET_MAX_SPLIT) {
      return Promise.resolve({ type: "stay", notice: "5 people maximum." });
    }
    return Promise.resolve({
      type: "stay",
      notice: "Added.",
      data: { ...ctx.data, recipients: [...recipients, phone.e164] },
    });
  },
};
