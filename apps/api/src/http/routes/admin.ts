import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { AppError } from "../../lib/errors.js";
import { maskPhone } from "../../lib/phone.js";
import { safeEqual } from "../../lib/secret.js";
import {
  assertProviderName,
  assertSimulationAllowed,
  settlePayment,
} from "../../payments/service.js";
import { admitTicket, lookupTicket, ticketPageUrl } from "../../tickets/pass.js";
import { asyncRoute } from "../asyncRoute.js";

export const adminRouter = Router();

function requireAdmin(header: string | undefined): void {
  if (!header || !safeEqual(header, config.adminSecret)) {
    throw new AppError("Admin secret required.", 401, "unauthorized");
  }
}

adminRouter.get("/api/meta", (_req, res) => {
  res.json({
    serviceCode: config.ussdServiceCode,
    mtnMode: config.mtnMode,
    airtelMode: config.airtelMode,
    paypalMode: config.paypalMode,
    smsMode: config.smsMode,
    displayCurrency: "RWF",
    sessionTtlSeconds: config.ussdSessionTtlSeconds,
  });
});

adminRouter.get(
  "/api/orders",
  asyncRoute(async (req, res) => {
    requireAdmin(req.header("x-admin-secret") ?? undefined);
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: true, event: true, payment: true, ticket: true },
    });
    res.json({
      orders: orders.map((order) => ({
        reference: order.reference,
        phone: maskPhone(order.user.phone),
        eventName: order.event.name,
        quantity: order.quantity,
        totalRwf: order.totalRwf,
        provider: order.payment?.provider ?? null,
        paymentStatus: order.payment?.status ?? null,
        orderStatus: order.status,
        approvalUrl: order.payment?.approvalUrl ?? null,
        ticketCode: order.ticket?.code ?? null,
        currencyCharged: order.payment?.currency ?? "RWF",
        amountCharged: order.payment?.amount ?? null,
        createdAt: order.createdAt.toISOString(),
      })),
    });
  }),
);

adminRouter.get(
  "/api/sms",
  asyncRoute(async (req, res) => {
    requireAdmin(req.header("x-admin-secret") ?? undefined);
    const messages = await prisma.smsLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    res.json({
      messages: messages.map((message) => ({
        id: message.id,
        to: maskPhone(message.toPhone),
        body: message.body,
        provider: message.provider,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  }),
);

const simulateSchema = z.object({
  status: z.enum(["SUCCESSFUL", "FAILED"]),
});

adminRouter.post(
  "/api/payments/:reference/simulate",
  asyncRoute(async (req, res) => {
    requireAdmin(req.header("x-admin-secret") ?? undefined);
    const body = simulateSchema.parse(req.body);
    const reference = z.string().min(1).parse(req.params.reference);
    const payment = await prisma.payment.findFirst({
      where: { OR: [{ externalRef: reference }, { order: { reference } }] },
    });
    if (!payment) throw new AppError("Unknown payment reference.", 404, "unknown_payment");
    const provider = assertProviderName(payment.provider);
    assertSimulationAllowed(provider);
    const settled = await settlePayment({
      provider,
      providerRef: reference,
      status: body.status,
      raw: { source: "admin_simulate", status: body.status },
      deliveryId: `simulate:${payment.id}:${body.status}:${Date.now()}`,
    });
    res
      .status(200)
      .json({ ok: true, duplicate: settled.duplicate, ticketCode: settled.ticketCode ?? null });
  }),
);

adminRouter.get(
  "/api/tickets/:code",
  asyncRoute(async (req, res) => {
    res.json(await lookupTicket(z.string().parse(req.params.code)));
  }),
);

adminRouter.post(
  "/api/tickets/:code/admit",
  asyncRoute(async (req, res) => {
    res.json(await admitTicket(z.string().parse(req.params.code)));
  }),
);

adminRouter.get(
  "/api/tickets/:code/qr",
  asyncRoute(async (req, res) => {
    const code = z
      .string()
      .regex(/^[A-Za-z0-9]{4,12}$/)
      .parse(req.params.code)
      .toUpperCase();
    const ticket = await prisma.ticket.findUnique({ where: { code } });
    if (!ticket) throw new AppError("Ticket not found.", 404, "ticket_not_found");
    const png = await QRCode.toBuffer(ticketPageUrl(code), {
      type: "png",
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(png);
  }),
);
