import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { maskPhone, normalizeRwandaPhone } from "../lib/phone.js";
import { makeReference, safeJson } from "../payments/ids.js";

export const WALLET_TOPUP_RWF = 10_000;
export const WALLET_MAX_BALANCE_RWF = 100_000;
export const WALLET_MAX_AMOUNT_RWF = 1_000_000;
export const WALLET_MAX_SPLIT = 5;

const walletKinds = ["TOPUP", "SEND", "SPLIT", "TICKET"] as const;
export type WalletKind = (typeof walletKinds)[number];

export type WalletMove = {
  reference: string;
  kind: WalletKind;
  amountRwf: number;
  shareRwf: number;
  remainderRwf: number;
  balanceRwf: number;
  duplicate: boolean;
  recipients: { phone: string; amountRwf: number }[];
};

export type WalletActivity = {
  reference: string;
  kind: WalletKind;
  direction: "in" | "out";
  amountRwf: number;
  counterparty: string;
  createdAt: string;
};

export type WalletView = {
  phone: string;
  currency: "RWF";
  balanceRwf: number;
  transfers: WalletActivity[];
};

export type SplitQuote = {
  shareRwf: number;
  remainderRwf: number;
  debitRwf: number;
};

type Tx = Prisma.TransactionClient;
type LineDirection = "DEBIT" | "CREDIT";

function requirePhone(input: string): string {
  const phone = normalizeRwandaPhone(input);
  if (!phone) throw new AppError("Enter a Rwandan mobile number.", 400, "invalid_phone");
  return phone.e164;
}

function requireKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new AppError("Missing transfer key.", 400, "invalid_key");
  }
  return trimmed;
}

function asKind(value: string): WalletKind {
  for (const kind of walletKinds) {
    if (kind === value) return kind;
  }
  return "SEND";
}

export async function debitBalance(
  tx: Tx,
  phone: string,
  amountRwf: number,
): Promise<{ userId: string }> {
  const ownerId = await userId(tx, requirePhone(phone));
  await debit(tx, ownerId, amountRwf);
  return { userId: ownerId };
}

export async function recordTicketSpend(
  tx: Tx,
  input: { userId: string; phone: string; amountRwf: number; idempotencyKey: string },
): Promise<void> {
  await posted(tx, {
    idempotencyKey: input.idempotencyKey,
    kind: "TICKET",
    fromUserId: input.userId,
    totalRwf: input.amountRwf,
    shareRwf: input.amountRwf,
    remainderRwf: 0,
    actorPhone: input.phone,
    lines: [{ userId: input.userId, direction: "DEBIT", amountRwf: input.amountRwf }],
  });
}

export function parseWalletAmount(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,7}$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > WALLET_MAX_AMOUNT_RWF) return null;
  return value;
}

export function quoteSplit(amountRwf: number, count: number): SplitQuote | null {
  if (count < 2 || count > WALLET_MAX_SPLIT) return null;
  const shareRwf = Math.floor(amountRwf / count);
  if (shareRwf < 1) return null;
  return { shareRwf, remainderRwf: amountRwf - shareRwf * count, debitRwf: shareRwf * count };
}

export function ussdTransferKey(action: string, requestKey: string): string {
  return createHash("sha256").update(`${action}:${requestKey}`).digest("hex");
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function userId(tx: Tx, phone: string): Promise<string> {
  const user = await tx.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
  return user.id;
}

async function debit(tx: Tx, ownerId: string, amount: number): Promise<void> {
  const wallet = await tx.wallet.upsert({
    where: { userId: ownerId },
    update: {},
    create: { userId: ownerId, balanceRwf: 0 },
  });
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, balanceRwf: { gte: amount } },
    data: { balanceRwf: { decrement: amount } },
  });
  if (updated.count !== 1)
    throw new AppError("Not enough money in this wallet.", 400, "insufficient_funds");
}

async function credit(tx: Tx, ownerId: string, amount: number): Promise<void> {
  const wallet = await tx.wallet.upsert({
    where: { userId: ownerId },
    update: {},
    create: { userId: ownerId, balanceRwf: 0 },
  });
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, balanceRwf: { lte: WALLET_MAX_BALANCE_RWF - amount } },
    data: { balanceRwf: { increment: amount } },
  });
  if (updated.count !== 1) {
    throw new AppError("A wallet in this transfer would pass 100000 RWF.", 400, "wallet_limit");
  }
}

async function posted(
  tx: Tx,
  input: {
    idempotencyKey: string;
    kind: WalletKind;
    fromUserId: string | null;
    totalRwf: number;
    shareRwf: number;
    remainderRwf: number;
    actorPhone: string;
    lines: { userId: string; direction: LineDirection; amountRwf: number }[];
  },
): Promise<string> {
  const transfer = await tx.transfer.create({
    data: {
      reference: makeReference(),
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      fromUserId: input.fromUserId,
      totalRwf: input.totalRwf,
      shareRwf: input.shareRwf,
      remainderRwf: input.remainderRwf,
      status: "POSTED",
      lines: { create: input.lines },
    },
  });
  await tx.auditLog.create({
    data: {
      action: `wallet.${input.kind.toLowerCase()}`,
      actor: maskPhone(input.actorPhone),
      entity: "Transfer",
      entityId: transfer.id,
      meta: safeJson({
        reference: transfer.reference,
        amountRwf: input.totalRwf,
        kind: input.kind,
      }),
    },
  });
  return transfer.id;
}

async function loadMove(
  transferId: string,
  phone: string,
  duplicate: boolean,
): Promise<WalletMove> {
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { lines: { include: { user: true } } },
  });
  const owner = await prisma.user.findUnique({ where: { phone }, include: { wallet: true } });
  return {
    reference: transfer.reference,
    kind: asKind(transfer.kind),
    amountRwf: transfer.totalRwf,
    shareRwf: transfer.shareRwf ?? transfer.totalRwf,
    remainderRwf: transfer.remainderRwf,
    balanceRwf: owner?.wallet?.balanceRwf ?? 0,
    duplicate,
    recipients: transfer.lines
      .filter((line) => line.direction === "CREDIT")
      .map((line) => ({ phone: maskPhone(line.user.phone), amountRwf: line.amountRwf })),
  };
}

async function once(
  idempotencyKey: string,
  phone: string,
  post: (tx: Tx) => Promise<string>,
): Promise<WalletMove> {
  const existing = await prisma.transfer.findUnique({ where: { idempotencyKey } });
  if (existing) return loadMove(existing.id, phone, true);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const id = await prisma.$transaction((tx) => post(tx));
      return loadMove(id, phone, false);
    } catch (error) {
      if (!isUnique(error)) throw error;
      const raced = await prisma.transfer.findUnique({ where: { idempotencyKey } });
      if (raced) return loadMove(raced.id, phone, true);
    }
  }
  throw new AppError("Could not post the transfer.", 500, "wallet_busy");
}

export async function walletBalance(phoneInput: string): Promise<number> {
  const phone = requirePhone(phoneInput);
  const user = await prisma.user.findUnique({ where: { phone }, include: { wallet: true } });
  return user?.wallet?.balanceRwf ?? 0;
}

export async function getWallet(phoneInput: string): Promise<WalletView> {
  const phone = requirePhone(phoneInput);
  const user = await prisma.user.findUnique({ where: { phone }, include: { wallet: true } });
  if (!user) {
    return { phone: maskPhone(phone), currency: "RWF", balanceRwf: 0, transfers: [] };
  }
  const lines = await prisma.transferLine.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { transfer: { include: { lines: { include: { user: true } } } } },
  });
  return {
    phone: maskPhone(phone),
    currency: "RWF",
    balanceRwf: user.wallet?.balanceRwf ?? 0,
    transfers: lines.map((line) => describeLine(line)),
  };
}

function describeLine(line: {
  direction: string;
  amountRwf: number;
  userId: string;
  transfer: {
    reference: string;
    kind: string;
    createdAt: Date;
    lines: { userId: string; direction: string; user: { phone: string } }[];
  };
}): WalletActivity {
  const kind = asKind(line.transfer.kind);
  const inbound = line.direction === "CREDIT";
  if (kind === "TOPUP" || kind === "TICKET") {
    return {
      reference: line.transfer.reference,
      kind,
      direction: kind === "TICKET" ? "out" : "in",
      amountRwf: line.amountRwf,
      counterparty: kind === "TICKET" ? "Ticket" : "Deposit",
      createdAt: line.transfer.createdAt.toISOString(),
    };
  }
  const others = line.transfer.lines.filter((entry) => entry.userId !== line.userId);
  const counterparty =
    kind === "SPLIT" && line.direction === "DEBIT"
      ? `${others.length} people`
      : maskPhone(others[0]?.user.phone ?? "");
  return {
    reference: line.transfer.reference,
    kind,
    direction: inbound ? "in" : "out",
    amountRwf: line.amountRwf,
    counterparty,
    createdAt: line.transfer.createdAt.toISOString(),
  };
}

export async function topUp(input: {
  phone: string;
  idempotencyKey: string;
  amountRwf?: number;
}): Promise<WalletMove> {
  const phone = requirePhone(input.phone);
  const idempotencyKey = requireKey(input.idempotencyKey);
  const amountRwf = input.amountRwf ?? WALLET_TOPUP_RWF;
  if (!Number.isInteger(amountRwf) || amountRwf < 1 || amountRwf > WALLET_MAX_AMOUNT_RWF) {
    throw new AppError("Enter an amount from 1 to 1000000 RWF.", 400, "invalid_amount");
  }
  return once(idempotencyKey, phone, async (tx) => {
    const ownerId = await userId(tx, phone);
    await credit(tx, ownerId, amountRwf);
    return posted(tx, {
      idempotencyKey,
      kind: "TOPUP",
      fromUserId: null,
      totalRwf: amountRwf,
      shareRwf: amountRwf,
      remainderRwf: 0,
      actorPhone: phone,
      lines: [{ userId: ownerId, direction: "CREDIT", amountRwf }],
    });
  });
}

export async function sendToWallet(input: {
  fromPhone: string;
  toPhone: string;
  amountRwf: number;
  idempotencyKey: string;
}): Promise<WalletMove> {
  const fromPhone = requirePhone(input.fromPhone);
  const toPhone = requirePhone(input.toPhone);
  const idempotencyKey = requireKey(input.idempotencyKey);
  if (fromPhone === toPhone)
    throw new AppError("You cannot send to your own number.", 400, "self_transfer");
  if (
    !Number.isInteger(input.amountRwf) ||
    input.amountRwf < 1 ||
    input.amountRwf > WALLET_MAX_AMOUNT_RWF
  ) {
    throw new AppError("Enter an amount from 1 to 1000000 RWF.", 400, "invalid_amount");
  }
  const amountRwf = input.amountRwf;
  return once(idempotencyKey, fromPhone, async (tx) => {
    const fromId = await userId(tx, fromPhone);
    const toId = await userId(tx, toPhone);
    await debit(tx, fromId, amountRwf);
    await credit(tx, toId, amountRwf);
    return posted(tx, {
      idempotencyKey,
      kind: "SEND",
      fromUserId: fromId,
      totalRwf: amountRwf,
      shareRwf: amountRwf,
      remainderRwf: 0,
      actorPhone: fromPhone,
      lines: [
        { userId: fromId, direction: "DEBIT", amountRwf },
        { userId: toId, direction: "CREDIT", amountRwf },
      ],
    });
  });
}

export async function splitWallet(input: {
  fromPhone: string;
  amountRwf: number;
  phones: string[];
  idempotencyKey: string;
}): Promise<WalletMove> {
  const fromPhone = requirePhone(input.fromPhone);
  const idempotencyKey = requireKey(input.idempotencyKey);
  if (
    !Number.isInteger(input.amountRwf) ||
    input.amountRwf < 1 ||
    input.amountRwf > WALLET_MAX_AMOUNT_RWF
  ) {
    throw new AppError("Enter an amount from 1 to 1000000 RWF.", 400, "invalid_amount");
  }
  const phones = distinctRecipients(fromPhone, input.phones);
  const quote = quoteSplit(input.amountRwf, phones.length);
  if (!quote) throw new AppError("That amount is too small to split.", 400, "invalid_amount");
  return once(idempotencyKey, fromPhone, async (tx) => {
    const fromId = await userId(tx, fromPhone);
    const recipientIds = await Promise.all(phones.map((phone) => userId(tx, phone)));
    await debit(tx, fromId, quote.debitRwf);
    for (const recipientId of recipientIds) {
      await credit(tx, recipientId, quote.shareRwf);
    }
    return posted(tx, {
      idempotencyKey,
      kind: "SPLIT",
      fromUserId: fromId,
      totalRwf: quote.debitRwf,
      shareRwf: quote.shareRwf,
      remainderRwf: quote.remainderRwf,
      actorPhone: fromPhone,
      lines: [
        { userId: fromId, direction: "DEBIT", amountRwf: quote.debitRwf },
        ...recipientIds.map((recipientId) => ({
          userId: recipientId,
          direction: "CREDIT" as const,
          amountRwf: quote.shareRwf,
        })),
      ],
    });
  });
}

function distinctRecipients(fromPhone: string, raw: string[]): string[] {
  if (raw.length < 2) throw new AppError("Add at least two people.", 400, "too_few");
  if (raw.length > WALLET_MAX_SPLIT)
    throw new AppError("A split can include up to 5 people.", 400, "too_many");
  const phones = raw.map(requirePhone);
  if (new Set(phones).size !== phones.length) {
    throw new AppError("Each person can appear once.", 400, "duplicate_recipient");
  }
  if (phones.includes(fromPhone))
    throw new AppError("You cannot send to your own number.", 400, "self_transfer");
  return phones;
}
