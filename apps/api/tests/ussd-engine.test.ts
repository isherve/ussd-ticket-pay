import { describe, expect, it } from "vitest";
import { runUssd, type EngineSession } from "../src/ussd/engine.js";
import type { EventChoice, PurchaseLine, UssdDeps } from "../src/ussd/types.js";

const events: EventChoice[] = [
  { id: "e1", shortName: "Jazz Night", priceRwf: 5000 },
  { id: "e2", shortName: "Umuganura", priceRwf: 3000 },
  { id: "e3", shortName: "Amavubi", priceRwf: 8000 },
  { id: "e4", shortName: "Arts Fest", priceRwf: 2000 },
];

function deps(purchases: PurchaseLine[] = []): UssdDeps {
  return {
    async listEvents(page, pageSize) {
      const pages = Math.max(1, Math.ceil(events.length / pageSize));
      return { items: events.slice(page * pageSize, page * pageSize + pageSize), page, pages };
    },
    async listPurchases() {
      return purchases;
    },
    async startPayment() {
      return { reference: "AB12CD34" };
    },
  };
}

const now = new Date("2026-10-07T08:00:00.000Z");

async function step(text: string, session: EngineSession | null, network: "mtn" | "airtel" = "mtn") {
  return runUssd({
    session,
    expired: false,
    text,
    now,
    ttlMs: 120_000,
    ctx: { phone: "+250788123456", network, deps: deps(), pageSize: 3 },
  });
}

function visible(body: string): string {
  expect(body.startsWith("CON ") || body.startsWith("END ")).toBe(true);
  const text = body.slice(4);
  expect(text.length).toBeLessThanOrEqual(182);
  return text;
}

describe("USSD state machine", () => {
  it("walks from welcome to a payment reference", async () => {
    const welcome = await step("", null);
    expect(visible(welcome.body)).toContain("1. Buy ticket");
    const listed = await step("1", welcome.session);
    expect(visible(listed.body)).toContain("Jazz Night");
    expect(visible(listed.body)).toContain("98. Next");
    const qty = await step("1*1", listed.session);
    expect(visible(qty.body)).toContain("Qty 1-5");
    const pay = await step("1*1*2", qty.session);
    expect(visible(pay.body)).toContain("Suggested: MTN");
    const confirm = await step("1*1*2*1", pay.session);
    expect(visible(confirm.body)).toContain("Total 10000 RWF");
    expect(visible(confirm.body)).toContain("Via MTN MoMo");
    const done = await step("1*1*2*1*1", confirm.session);
    expect(done.body.startsWith("END ")).toBe(true);
    expect(visible(done.body)).toContain("Ref: AB12CD34");
    expect(done.session).toBeNull();
  });

  it("re-prompts on an invalid choice and still accepts the next input", async () => {
    const welcome = await step("", null);
    const invalid = await step("9", welcome.session);
    expect(visible(invalid.body)).toContain("Invalid choice.");
    expect(visible(invalid.body)).toContain("1. Buy ticket");
    const next = await step("9*1", invalid.session);
    expect(visible(next.body)).toContain("Events 1/2");
  });

  it("paginates events and suggests Airtel for a 072 number", async () => {
    const welcome = await step("", null, "airtel");
    const page2 = await step("1*98", welcome.session, "airtel");
    expect(visible(page2.body)).toContain("Arts Fest");
    expect(visible(page2.body)).not.toContain("98. Next");
    const pay = await step("1*98*1*1", page2.session, "airtel");
    expect(visible(pay.body)).toContain("Suggested: Airtel");
  });

  it("ends an expired session instead of reusing it", async () => {
    const expired = await runUssd({
      session: null,
      expired: true,
      text: "1",
      now,
      ttlMs: 120_000,
      ctx: { phone: "+250788123456", network: "mtn", deps: deps(), pageSize: 3 },
    });
    expect(expired.body).toContain("Session expired");
    expect(expired.end).toBe(true);
  });
});
