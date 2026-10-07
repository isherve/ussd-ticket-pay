import { Prisma, type Payment, type Ticket } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { maskPhone, normalizeRwandaPhone } from "../lib/phone.js";
import { logger } from "../logger.js";
import { approvalSms, ticketSms } from "../sms/types.js";
import { getSmsService } from "../sms/index.js";
import type { PaymentChoice, PurchaseLine, StartPaymentInput } from "../ussd/types.js";
import { ticketPageUrl } from "../tickets/pass.js";
import { makeReference, makeTicketCode, safeJson } from "./ids.js";
import { providerCharge } from "./money.js";
import { callbackUrl, getProvider, providerMode } from "./registry.js";
import type { PaymentStatus, ProviderName } from "./types.js";

const paymentInclude = {
  order: { include: { user: true, event: true, ticket: true } },
} satisfies Prisma.PaymentInclude;

type PaymentWithOrder = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export async function startCheckout(
  input: StartPaymentInput,
): Promise<{ reference: string; approvalUrl?: string }> {
  const phone = normalizeRwandaPhone(input.phone);
  if (!phone) throw new AppError("Use a Rwandan mobile number.", 400, "invalid_phone");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 5) {
    throw new AppError("Quantity must be 1 to 5.", 400, "invalid_quantity");
  }

  const reference = makeReference();
  const externalRef = randomUUID();
  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: input.eventId, active: true } });
    if (!event) throw new AppError("That event is not available.", 404, "event_not_found");
    if (event.ticketsSold + input.quantity > event.capacity) {
      throw new AppError("Not enough tickets left.", 409, "sold_out");
    }
    const user = await tx.user.upsert({
      where: { phone: phone.e164 },
      update: {},
      create: { phone: phone.e164 },
    });
    const totalRwf = event.priceRwf * input.quantity;
    const charge = providerCharge(totalRwf, input.provider);
    const order = await tx.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        quantity: input.quantity,
        unitPriceRwf: event.priceRwf,
        totalRwf,
        currency: "RWF",
        status: "PENDING",
        reference,
      },
    });
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: input.provider,
        externalRef,
        amount: charge.amount,
        currency: charge.currency,
        status: "PENDING",
      },
    });
    await tx.auditLog.create({
      data: {
        action: "payment.initiated",
        actor: maskPhone(phone.e164),
        entity: "payment",
        entityId: payment.id,
        meta: safeJson({ reference, provider: input.provider, totalRwf }),
      },
    });
    return { event, payment, charge, totalRwf };
  });

  const provider = getProvider(input.provider);
  try {
    const result = await provider.initiatePayment({
      reference: externalRef,
      publicReference: reference,
      amount: created.charge.amount,
      currency: created.charge.currency,
      phoneE164: phone.e164,
      description: `Tickets ${created.event.shortName}`,
      callbackUrl: callbackUrl(input.provider),
    });
    await prisma.payment.update({
      where: { id: created.payment.id },
      data: {
        externalRef: result.providerRef,
        approvalUrl: result.approvalUrl,
        rawResponse: safeJson(result.raw),
      },
    });
    if (result.status === "SUCCESSFUL" || result.status === "FAILED") {
      await settlePayment({
        provider: input.provider,
        providerRef: result.providerRef,
        status: result.status,
        raw: result.raw,
        deliveryId: `initiate:${result.providerRef}:${result.status}`,
      });
    } else if (result.approvalUrl) {
      await getSmsService().send({
        to: phone.e164,
        body: approvalSms(reference, result.approvalUrl),
        orderId: created.payment.orderId,
      });
    }
    return { reference, approvalUrl: result.approvalUrl };
  } catch (error) {
    logger.error({ err: error, reference, provider: input.provider }, "payment initiation failed");
    await prisma.payment.update({
      where: { id: created.payment.id },
      data: { status: "FAILED", rawResponse: safeJson({ error: "initiation_failed" }) },
    });
    await prisma.order.update({
      where: { id: created.payment.orderId },
      data: { status: "FAILED" },
    });
    if (error instanceof AppError) throw error;
    throw new AppError("Payment could not start.", 502, "payment_failed");
  }
}

type TicketNotice = {
  ticketId: string;
  orderId: string;
  phone: string;
  eventName: string;
  quantity: number;
  reference: string;
};

type Settled = {
  duplicate: boolean;
  ticketCode?: string;
  notify?: TicketNotice;
};

export async function settlePayment(input: {
  provider: ProviderName;
  providerRef: string;
  status: PaymentStatus;
  raw: unknown;
  deliveryId: string;
}): Promise<{ duplicate: boolean; ticketCode?: string }> {
  try {
    const settled: Settled = await prisma.$transaction(async (tx): Promise<Settled> => {
      const receipt = await tx.webhookReceipt.findUnique({
        where: { provider_deliveryId: { provider: input.provider, deliveryId: input.deliveryId } },
      });
      if (receipt) {
        const current = await findPayment(tx, input.providerRef);
        return { duplicate: true, ticketCode: current?.order.ticket?.code };
      }
      await tx.webhookReceipt.create({
        data: { provider: input.provider, deliveryId: input.deliveryId },
      });

      const payment = await findPayment(tx, input.providerRef);
      if (!payment) throw new AppError("Unknown payment reference.", 404, "unknown_payment");
      if (payment.status !== "PENDING") {
        return { duplicate: true, ticketCode: payment.order.ticket?.code };
      }
      if (input.status === "PENDING") return { duplicate: false };

      if (input.status === "FAILED" || input.status === "EXPIRED") {
        await tx.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: input.status, rawResponse: safeJson(input.raw) },
        });
        await tx.order.updateMany({
          where: { id: payment.orderId, status: "PENDING" },
          data: { status: input.status === "EXPIRED" ? "EXPIRED" : "FAILED" },
        });
        await tx.auditLog.create({
          data: {
            action: "payment.updated",
            actor: maskPhone(payment.order.user.phone),
            entity: "payment",
            entityId: payment.id,
            meta: safeJson({ status: input.status, reference: payment.order.reference }),
          },
        });
        return { duplicate: false };
      }

      const won = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "SUCCESSFUL", rawResponse: safeJson(input.raw) },
      });
      if (won.count === 0) {
        const existing = await tx.ticket.findUnique({ where: { orderId: payment.orderId } });
        return { duplicate: true, ticketCode: existing?.code };
      }

      const reserved = await tx.event.updateMany({
        where: {
          id: payment.order.eventId,
          ticketsSold: { lte: payment.order.event.capacity - payment.order.quantity },
        },
        data: { ticketsSold: { increment: payment.order.quantity } },
      });
      if (reserved.count === 0) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
        return { duplicate: false };
      }

      const code = makeTicketCode();
      const ticket = await tx.ticket.create({
        data: {
          orderId: payment.orderId,
          userId: payment.order.userId,
          eventId: payment.order.eventId,
          code,
          qrPayload: ticketPageUrl(code),
          status: "ISSUED",
        },
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });
      await tx.auditLog.create({
        data: {
          action: "ticket.issued",
          actor: maskPhone(payment.order.user.phone),
          entity: "ticket",
          entityId: ticket.id,
          meta: safeJson({ code, reference: payment.order.reference }),
        },
      });
      return {
        duplicate: false,
        ticketCode: code,
        notify: {
          ticketId: ticket.id,
          orderId: payment.orderId,
          phone: payment.order.user.phone,
          eventName: payment.order.event.shortName,
          quantity: payment.order.quantity,
          reference: payment.order.reference,
        },
      };
    });

    if (settled.notify) {
      await getSmsService().send({
        to: settled.notify.phone,
        body: ticketSms({
          eventName: settled.notify.eventName,
          quantity: settled.notify.quantity,
          code: settled.ticketCode ?? "",
          reference: settled.notify.reference,
        }),
        ticketId: settled.notify.ticketId,
        orderId: settled.notify.orderId,
      });
    }
    return { duplicate: settled.duplicate, ticketCode: settled.ticketCode };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true };
    }
    throw error;
  }
}

async function findPayment(
  tx: Prisma.TransactionClient,
  providerRef: string,
): Promise<PaymentWithOrder | null> {
  const byExternal = await tx.payment.findUnique({
    where: { externalRef: providerRef },
    include: paymentInclude,
  });
  if (byExternal) return byExternal;
  const order = await tx.order.findUnique({
    where: { reference: providerRef },
    include: { payment: { include: paymentInclude } },
  });
  return order?.payment ?? null;
}

export async function listPurchases(phone: string): Promise<PurchaseLine[]> {
  const orders = await prisma.order.findMany({
    where: { user: { phone } },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { event: true, payment: true, ticket: true },
  });
  return orders.map((order) => ({
    label: order.event.shortName,
    status: order.ticket ? "ISSUED" : (order.payment?.status ?? order.status),
    code: order.ticket?.code,
  }));
}

export function assertProviderName(value: string): ProviderName {
  if (value === "mtn" || value === "airtel" || value === "paypal") return value;
  throw new AppError("Unknown payment provider.", 400, "unknown_provider");
}

export function assertSimulationAllowed(provider: PaymentChoice): void {
  if (providerMode(provider) !== "mock") {
    throw new AppError("Simulation is only available in mock mode.", 403, "simulation_disabled");
  }
}

export async function sendMissingTicketSms(): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: { status: "ISSUED" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { order: { include: { user: true, event: true } } },
  });
  let sent = 0;
  for (const ticket of tickets) {
    const existing = await prisma.smsLog.findFirst({ where: { ticketId: ticket.id } });
    if (existing) continue;
    await getSmsService().send({
      to: ticket.order.user.phone,
      body: ticketSms({
        eventName: ticket.order.event.shortName,
        quantity: ticket.order.quantity,
        code: ticket.code,
        reference: ticket.order.reference,
      }),
      ticketId: ticket.id,
      orderId: ticket.orderId,
    });
    sent += 1;
  }
  return sent;
}

export type { Payment, Ticket };
