import { assertUssdLength, clip } from "../../lib/ussdLimit.js";
import type { ScreenContext, ScreenStep, UssdScreen } from "../types.js";

export const ticketsScreen: UssdScreen = {
  id: "tickets",
  async show(ctx: ScreenContext): Promise<string> {
    const purchases = await ctx.deps.listPurchases(ctx.phone);
    if (purchases.length === 0) {
      return assertUssdLength("My tickets\nNone yet.\n0. Back");
    }
    const lines = ["My tickets"];
    purchases.slice(0, 3).forEach((purchase, index) => {
      const code = purchase.code ? ` ${purchase.code}` : "";
      lines.push(`${index + 1}. ${clip(purchase.label, 12)} ${purchase.status}${code}`);
    });
    lines.push("0. Back");
    return assertUssdLength(lines.join("\n"));
  },
  onInput(input: string): Promise<ScreenStep> {
    if (input.trim() === "0") return Promise.resolve({ type: "goto", screen: "welcome" });
    return Promise.resolve({ type: "stay", notice: "Press 0 to go back." });
  },
};
