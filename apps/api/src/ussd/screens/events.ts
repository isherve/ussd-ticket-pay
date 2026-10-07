import { assertUssdLength, clip } from "../../lib/ussdLimit.js";
import type { ScreenContext, ScreenStep, SessionData, UssdScreen } from "../types.js";

export const eventsScreen: UssdScreen = {
  id: "events",
  async show(ctx: ScreenContext): Promise<string> {
    const listed = await ctx.deps.listEvents(ctx.data.eventPage, ctx.pageSize);
    if (listed.items.length === 0) {
      return assertUssdLength("No events open.\n0. Back");
    }
    const lines = [`Events ${listed.page + 1}/${listed.pages}`];
    listed.items.forEach((event, index) => {
      lines.push(`${index + 1}. ${clip(event.shortName, 16)} ${event.priceRwf}`);
    });
    if (listed.page < listed.pages - 1) lines.push("98. Next");
    lines.push("0. Back");
    return assertUssdLength(lines.join("\n"));
  },
  async onInput(input: string, ctx: ScreenContext): Promise<ScreenStep> {
    const choice = input.trim();
    if (choice === "0") {
      return { type: "goto", screen: "welcome", data: { eventPage: 0 } };
    }
    const listed = await ctx.deps.listEvents(ctx.data.eventPage, ctx.pageSize);
    if (choice === "98") {
      if (listed.page >= listed.pages - 1) {
        return { type: "stay", notice: "Last page." };
      }
      const data: SessionData = { ...ctx.data, eventPage: listed.page + 1 };
      return { type: "goto", screen: "events", data };
    }
    const index = Number(choice);
    const event = Number.isInteger(index) ? listed.items[index - 1] : undefined;
    if (!event) return { type: "stay", notice: "Invalid choice." };
    return {
      type: "goto",
      screen: "quantity",
      data: {
        ...ctx.data,
        eventPage: listed.page,
        eventId: event.id,
        eventName: event.shortName,
        unitPriceRwf: event.priceRwf,
        quantity: undefined,
        provider: undefined,
      },
    };
  },
};
