import { prisma } from "../db.js";
import { cleanBuyerName } from "../lib/buyerName.js";
import { maskPhone, normalizeRwandaPhone } from "../lib/phone.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { listPurchases, startCheckout } from "../payments/service.js";
import { sendToWallet, splitWallet, topUp, walletBalance } from "../wallet/service.js";
import { isScreenId, parseSessionData, runUssd } from "./engine.js";
import type { UssdDeps } from "./types.js";

export function createUssdDeps(): UssdDeps {
  return {
    async listEvents(page, pageSize) {
      const total = await prisma.event.count({ where: { active: true } });
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(Math.max(page, 0), pages - 1);
      const rows = await prisma.event.findMany({
        where: { active: true },
        orderBy: { startsAt: "asc" },
        skip: safePage * pageSize,
        take: pageSize,
      });
      return {
        page: safePage,
        pages,
        items: rows.map((row) => ({
          id: row.id,
          shortName: row.shortName,
          priceRwf: row.priceRwf,
        })),
      };
    },
    listPurchases,
    startPayment: (input) => startCheckout(input),
    walletBalance,
    walletTopUp: topUp,
    walletSend: sendToWallet,
    walletSplit: splitWallet,
  };
}

export async function handleUssdSession(input: {
  sessionId: string;
  phoneNumber: string;
  text: string;
  buyerName?: string;
  deps?: UssdDeps;
}): Promise<string> {
  const phone = normalizeRwandaPhone(input.phoneNumber);
  if (!phone) return "END This service accepts Rwandan numbers (+250).";

  const buyerName = cleanBuyerName(input.buyerName);
  if (buyerName) {
    await prisma.user.upsert({
      where: { phone: phone.e164 },
      update: { name: buyerName },
      create: { phone: phone.e164, name: buyerName },
    });
  }

  const now = new Date();
  const existing = await prisma.ussdSession.findUnique({ where: { sessionId: input.sessionId } });
  const expired = Boolean(existing && existing.expiresAt.getTime() <= now.getTime());
  if (existing && expired) {
    await prisma.ussdSession.delete({ where: { sessionId: input.sessionId } });
  }

  const result = await runUssd({
    session:
      existing && !expired
        ? {
            state: isScreenId(existing.state) ? existing.state : "welcome",
            data: parseSessionData(existing.data),
            lastText: existing.lastText,
            expiresAt: existing.expiresAt,
          }
        : null,
    expired: Boolean(existing && expired && input.text.length > 0),
    text: input.text,
    now,
    ttlMs: config.ussdSessionTtlSeconds * 1000,
    ctx: {
      phone: phone.e164,
      network: phone.network,
      deps: input.deps ?? createUssdDeps(),
      pageSize: config.ussdPageSize,
      requestKey: `${input.sessionId}:${input.text}`,
    },
  });

  if (result.session) {
    const data = {
      phone: phone.e164,
      state: result.session.state,
      data: JSON.stringify(result.session.data),
      lastText: result.session.lastText,
      expiresAt: result.session.expiresAt,
    };
    await prisma.ussdSession.upsert({
      where: { sessionId: input.sessionId },
      create: { sessionId: input.sessionId, ...data },
      update: data,
    });
  }

  logger.info(
    { sessionId: input.sessionId, phone: maskPhone(phone.e164), end: result.end },
    "ussd response",
  );
  return result.body;
}
