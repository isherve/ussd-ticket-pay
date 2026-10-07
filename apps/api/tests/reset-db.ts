import { afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { ensureSeed } from "../src/seed.js";

afterAll(async () => {
  await prisma.$disconnect();
});

export async function resetDb(): Promise<void> {
  await prisma.webhookReceipt.deleteMany();
  await prisma.smsLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ussdSession.deleteMany();
  await prisma.user.deleteMany();
  await ensureSeed();
}
