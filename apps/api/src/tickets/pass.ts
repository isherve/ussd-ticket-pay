import { config } from "../config.js";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { maskPhone } from "../lib/phone.js";

export type TicketPass = {
  code: string;
  status: string;
  eventName: string;
  venue: string;
  startsAt: string;
  quantity: number;
  totalRwf: number;
  reference: string;
  buyerName: string | null;
  phone: string;
  admittedAt: string | null;
};

export function ticketPageUrl(code: string): string {
  return `${config.webAppUrl}/t/${code}`;
}

export function parseTicketCode(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const fromPath = /\/t\/([A-Za-z0-9]{4,12})\/?$/.exec(url.pathname);
    if (fromPath?.[1]) return fromPath[1].toUpperCase();
  } catch {
    // A hand-typed code is not a URL.
  }
  const legacy = /^ussdticket:v1:([A-Za-z0-9]{4,12}):/i.exec(text);
  if (legacy?.[1]) return legacy[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(text)) return text.toUpperCase();
  return null;
}

function requireCode(raw: string): string {
  const code = parseTicketCode(raw);
  if (!code) throw new AppError("Ticket not found.", 404, "ticket_not_found");
  return code;
}

async function loadPass(code: string): Promise<TicketPass> {
  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: { event: true, order: true, user: true },
  });
  if (!ticket) throw new AppError("Ticket not found.", 404, "ticket_not_found");
  const admission = await prisma.auditLog.findFirst({
    where: { action: "ticket.admit", entityId: ticket.id },
    orderBy: { createdAt: "desc" },
  });
  return {
    code: ticket.code,
    status: ticket.status,
    eventName: ticket.event.name,
    venue: ticket.event.venue,
    startsAt: ticket.event.startsAt.toISOString(),
    quantity: ticket.order.quantity,
    totalRwf: ticket.order.totalRwf,
    reference: ticket.order.reference,
    buyerName: ticket.user.name,
    phone: maskPhone(ticket.user.phone),
    admittedAt: admission?.createdAt.toISOString() ?? null,
  };
}

export async function lookupTicket(raw: string): Promise<TicketPass> {
  return loadPass(requireCode(raw));
}

export async function admitTicket(raw: string): Promise<TicketPass> {
  const code = requireCode(raw);
  const ticket = await prisma.ticket.findUnique({ where: { code } });
  if (!ticket) throw new AppError("Ticket not found.", 404, "ticket_not_found");
  await prisma.$transaction(async (tx) => {
    const won = await tx.ticket.updateMany({
      where: { id: ticket.id, status: "ISSUED" },
      data: { status: "ADMITTED" },
    });
    if (won.count !== 1) return;
    await tx.auditLog.create({
      data: { action: "ticket.admit", entity: "ticket", entityId: ticket.id },
    });
  });
  return loadPass(code);
}
