import { assertUssdLength, clip } from "../../lib/ussdLimit.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

export const quantityScreen: UssdScreen = {
  id: "quantity",
  show(ctx: ScreenContext): Promise<string> {
    const name = clip(ctx.data.eventName ?? "Event", 18);
    const price = ctx.data.unitPriceRwf ?? 0;
    return Promise.resolve(assertUssdLength([name, `${price} RWF each`, "Qty 1-5", "0. Back"].join("\n")));
  },
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const choice = input.trim();
    if (choice === "0") {
      return Promise.resolve({
        type: "goto",
        screen: "events",
        data: { ...ctx.data, quantity: undefined, provider: undefined },
      });
    }
    const qty = Number(choice);
    if (!Number.isInteger(qty) || qty < 1 || qty > 5) {
      return Promise.resolve({ type: "stay", notice: "Enter 1-5." });
    }
    return Promise.resolve({
      type: "goto",
      screen: "payment",
      data: { ...ctx.data, quantity: qty, provider: undefined },
    });
  },
};
