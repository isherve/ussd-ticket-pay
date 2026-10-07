import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { reconcilePendingPayments } from "../src/jobs/reconcilePayments.js";
import { resetDb } from "./reset-db.js";

const app = createApp();
const phone = "+250788123456";
const secret = "test-webhook-secret";

function dial(sessionId: string, text: string, phoneNumber = phone, buyerName?: string) {
  return request(app).post("/ussd").type("form").send({
    sessionId,
    serviceCode: "*384*123#",
    phoneNumber,
    text,
    ...(buyerName ? { buyerName } : {}),
  });
}

describe("USSD HTTP flow", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("buys a ticket and shows it on the next session", async () => {
    const welcome = await dial("s1", "");
    expect(welcome.status).toBe(200);
    expect(welcome.headers["content-type"]).toMatch(/text\/plain/);
    expect(welcome.text.startsWith("CON ")).toBe(true);

    const confirm = await dial("s1", "1*1*2*1");
    expect(confirm.text).toContain("Total 10000 RWF");
    const done = await dial("s1", "1*1*2*1*1", phone, "Aline Uwase");
    expect(done.text.startsWith("END ")).toBe(true);
    const reference = done.text.split("Ref: ")[1]?.trim();
    expect(reference).toBeTruthy();

    const missing = await request(app)
      .post("/webhooks/mock")
      .send({ reference, status: "SUCCESSFUL" });
    expect(missing.status).toBe(401);

    const first = await request(app)
      .post("/webhooks/mock")
      .set("X-Callback-Token", secret)
      .send({ reference, status: "SUCCESSFUL" });
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.ticketCode).toEqual(expect.any(String));

    const second = await request(app)
      .post("/webhooks/mock")
      .set("X-Callback-Token", secret)
      .send({ reference, status: "SUCCESSFUL" });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    expect(await prisma.ticket.count()).toBe(1);
    expect(await prisma.smsLog.count({ where: { status: "SENT" } })).toBe(1);

    const tickets = await dial("s2", "2");
    expect(tickets.text).toContain("ISSUED");
    expect(tickets.text).toContain(first.body.ticketCode as string);

    const code = first.body.ticketCode;
    expect(typeof code).toBe("string");
    if (typeof code !== "string") return;

    const qr = await request(app).get(`/api/tickets/${code}/qr`);
    expect(qr.status).toBe(200);
    expect(qr.headers["content-type"]).toMatch(/image\/png/);
    expect(qr.body.length).toBeGreaterThan(100);

    const viewed = await request(app).get(`/api/tickets/${code}`);
    expect(viewed.status).toBe(200);
    expect(viewed.body.status).toBe("ISSUED");
    expect(viewed.body.eventName).toBe("Kigali Jazz Night");
    expect(viewed.body.buyerName).toBe("Aline Uwase");
    expect(viewed.body.totalRwf).toBe(10000);
    expect(viewed.body.phone).not.toBe(phone);
    expect(viewed.body.phone).toContain("***");

    const admitted = await request(app).post(`/api/tickets/${code}/admit`);
    expect(admitted.status).toBe(200);
    expect(admitted.body.status).toBe("ADMITTED");
    const repeat = await request(app).post(`/api/tickets/${code}/admit`);
    expect(repeat.body.status).toBe("ADMITTED");
    expect(repeat.body.admittedAt).toBe(admitted.body.admittedAt);
    expect(await prisma.ticket.count({ where: { status: "ADMITTED" } })).toBe(1);

    const unknown = await request(app).get("/api/tickets/ZZZZZZ");
    expect(unknown.status).toBe(404);
  });

  it("does not issue a ticket when the simulated payment fails", async () => {
    const done = await dial("s3", "1*2*1*2*1");
    const reference = done.text.split("Ref: ")[1]?.trim() ?? "";
    const failed = await request(app)
      .post("/api/payments/" + reference + "/simulate")
      .set("X-Admin-Secret", "test-admin-secret")
      .send({ status: "FAILED" });
    expect(failed.status).toBe(200);
    expect(await prisma.ticket.count()).toBe(0);
    const again = await request(app)
      .post("/api/payments/" + reference + "/simulate")
      .set("X-Admin-Secret", "test-admin-secret")
      .send({ status: "SUCCESSFUL" });
    expect(again.body.duplicate).toBe(true);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it("rejects a non-Rwandan number without creating a session", async () => {
    const response = await dial("s4", "", "+254711000111");
    expect(response.text).toContain("Rwandan");
    expect(await prisma.ussdSession.count()).toBe(0);
  });

  it("expires an idle session", async () => {
    await dial("s5", "");
    await prisma.ussdSession.update({
      where: { sessionId: "s5" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await dial("s5", "1");
    expect(response.text).toContain("Session expired");
  });
});

describe("reconciliation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("expires a pending mock payment that is older than the window", async () => {
    const done = await dial("s6", "1*1*1*1*1");
    const reference = done.text.split("Ref: ")[1]?.trim() ?? "";
    await prisma.payment.updateMany({
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });
    const result = await reconcilePendingPayments(new Date());
    expect(result.updated).toBe(1);
    const payment = await prisma.payment.findFirst({ where: { order: { reference } } });
    expect(payment?.status).toBe("EXPIRED");
    expect(await prisma.ticket.count()).toBe(0);
  });
});
