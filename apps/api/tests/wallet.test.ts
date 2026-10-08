import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ensureDemoWallet } from "../src/seed.js";
import { resetDb } from "./reset-db.js";

const app = createApp();
const from = "+250788123456";
const toA = "+250788999111";
const toB = "+250728999222";
const toC = "+250728999333";

async function balance(phone: string): Promise<number> {
  const response = await request(app).get("/api/wallet").query({ phone });
  expect(response.status).toBe(200);
  return response.body.balanceRwf as number;
}

describe("internal wallet", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("credits a deposit once, then sends and splits", async () => {
    const first = await request(app)
      .post("/api/wallet/topup")
      .send({ phone: from, idempotencyKey: "deposit-1" });
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.balanceRwf).toBe(10_000);
    expect(first.body.recipients[0].phone).not.toBe(from);

    const repeat = await request(app)
      .post("/api/wallet/topup")
      .send({ phone: from, idempotencyKey: "deposit-1" });
    expect(repeat.body.duplicate).toBe(true);
    expect(repeat.body.reference).toBe(first.body.reference);
    expect(await balance(from)).toBe(10_000);
    expect(await prisma.transfer.count()).toBe(1);

    const sent = await request(app).post("/api/wallet/send").send({
      fromPhone: from,
      toPhone: toA,
      amountRwf: 4000,
      idempotencyKey: "send-once-1",
    });
    expect(sent.status).toBe(200);
    expect(sent.body.balanceRwf).toBe(6000);
    expect(await balance(toA)).toBe(4000);

    const again = await request(app).post("/api/wallet/send").send({
      fromPhone: from,
      toPhone: toA,
      amountRwf: 4000,
      idempotencyKey: "send-once-1",
    });
    expect(again.body.duplicate).toBe(true);
    expect(await balance(from)).toBe(6000);

    const short = await request(app).post("/api/wallet/send").send({
      fromPhone: from,
      toPhone: toA,
      amountRwf: 9000,
      idempotencyKey: "send-short",
    });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe("insufficient_funds");

    const self = await request(app).post("/api/wallet/send").send({
      fromPhone: from,
      toPhone: from,
      amountRwf: 100,
      idempotencyKey: "send-self",
    });
    expect(self.status).toBe(400);
    expect(self.body.error).toBe("self_transfer");

    const split = await request(app)
      .post("/api/wallet/split")
      .send({
        fromPhone: from,
        amountRwf: 5000,
        phones: [toB, toC, toA],
        idempotencyKey: "split-once-1",
      });
    expect(split.status).toBe(200);
    expect(split.body.shareRwf).toBe(1666);
    expect(split.body.remainderRwf).toBe(2);
    expect(split.body.amountRwf).toBe(4998);
    expect(split.body.balanceRwf).toBe(1002);
    expect(await balance(toB)).toBe(1666);
    expect(await balance(toC)).toBe(1666);
    expect(await balance(toA)).toBe(5666);

    const view = await request(app).get("/api/wallet").query({ phone: from });
    expect(view.body.phone).toContain("***");
    expect(view.body.transfers.length).toBeGreaterThan(0);
    expect(JSON.stringify(view.body)).not.toContain(from);
  });

  it("issues one ticket from the wallet and ignores a repeated confirm", async () => {
    await request(app).post("/api/wallet/topup").send({ phone: from, idempotencyKey: "ticket-deposit" });
    const bought = await request(app).post("/ussd").type("form").send({
      sessionId: "ticket-wallet",
      serviceCode: "*384*123#",
      phoneNumber: from,
      text: "1*1*2*4*1",
      buyerName: "Aline Uwase",
    });
    expect(bought.status).toBe(200);
    expect(bought.text).toContain("Paid from wallet.");
    const code = /Code ([A-Z0-9]+)/.exec(bought.text)?.[1];
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(await balance(from)).toBe(0);
    expect(await prisma.ticket.count()).toBe(1);
    expect(await prisma.smsLog.count({ where: { status: "SENT" } })).toBe(1);

    const replay = await request(app).post("/ussd").type("form").send({
      sessionId: "ticket-wallet",
      serviceCode: "*384*123#",
      phoneNumber: from,
      text: "1*1*2*4*1",
    });
    expect(replay.text).toContain("Already paid.");
    expect(replay.text).toContain(code);
    expect(await prisma.ticket.count()).toBe(1);
    expect(await balance(from)).toBe(0);

    const broke = await request(app).post("/ussd").type("form").send({
      sessionId: "ticket-broke",
      serviceCode: "*384*123#",
      phoneNumber: "+250788111000",
      text: "1*1*1*4*1",
    });
    expect(broke.text).toContain("Not enough money");
    expect(await prisma.order.count({ where: { user: { phone: "+250788111000" } } })).toBe(0);
  });

  it("tops up and sends over USSD without posting twice", async () => {
    const funded = await request(app).post("/ussd").type("form").send({
      sessionId: "w1",
      serviceCode: "*384*123#",
      phoneNumber: from,
      text: "3*3*7500",
    });
    expect(funded.status).toBe(200);
    expect(funded.text).toContain("Added 7500 RWF");
    expect(funded.text).toContain("Ref:");

    const replay = await request(app).post("/ussd").type("form").send({
      sessionId: "w1",
      serviceCode: "*384*123#",
      phoneNumber: from,
      text: "3*3*7500",
    });
    expect(replay.text).toContain("Already added.");
    expect(await balance(from)).toBe(7_500);

    const sent = await request(app)
      .post("/ussd")
      .type("form")
      .send({
        sessionId: "w2",
        serviceCode: "*384*123#",
        phoneNumber: from,
        text: `3*1*${toA.replace("+250", "0")}*2500*1`,
      });
    expect(sent.text.startsWith("END ")).toBe(true);
    expect(sent.text).toContain("Sent 2500 RWF");
    expect(await balance(from)).toBe(5000);
    expect(await balance(toA)).toBe(2500);
  });

  it("opens the demo number with recent transfers and does not post them twice", async () => {
    await ensureDemoWallet();
    expect(await balance(from)).toBe(2500);
    const view = await request(app).get("/api/wallet").query({ phone: from });
    expect(view.body.transfers).toHaveLength(3);
    expect(view.body.transfers.map((entry: { kind: string }) => entry.kind).sort()).toEqual([
      "SEND",
      "SPLIT",
      "TOPUP",
    ]);

    await ensureDemoWallet();
    expect(await balance(from)).toBe(2500);
    expect(await prisma.transfer.count()).toBe(3);
  });

  it("credits the amount typed on deposit", async () => {
    const posted = await request(app).post("/api/wallet/topup").send({
      phone: from,
      amountRwf: 2500,
      idempotencyKey: "deposit-custom",
    });
    expect(posted.status).toBe(200);
    expect(posted.body.amountRwf).toBe(2500);
    expect(posted.body.balanceRwf).toBe(2500);

    const rejected = await request(app).post("/api/wallet/topup").send({
      phone: from,
      amountRwf: 0,
      idempotencyKey: "deposit-zero",
    });
    expect(rejected.status).toBe(400);
    expect(await balance(from)).toBe(2500);
  });
});
