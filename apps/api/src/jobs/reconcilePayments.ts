import { config } from "../config.js";
import { logger } from "../logger.js";
import { sendMissingTicketSms, settlePayment } from "../payments/service.js";
import { getProvider } from "../payments/registry.js";
import type { ProviderName } from "../payments/types.js";
import { prisma } from "../db.js";

export async function reconcilePendingPayments(now = new Date()): Promise<{ checked: number; updated: number }> {
  const cutoff = new Date(now.getTime() - config.reconcileAfterMinutes * 60_000);
  const expireBefore = new Date(now.getTime() - config.paymentExpireMinutes * 60_000);
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  let updated = 0;
  for (const payment of pending) {
    const providerName = payment.provider === "mtn" || payment.provider === "airtel" || payment.provider === "paypal"
      ? payment.provider
      : null;
    if (!providerName) continue;
    try {
      if (payment.createdAt < expireBefore) {
        const polled = await safeStatus(providerName, payment.externalRef);
        const status = polled === "SUCCESSFUL" || polled === "FAILED" ? polled : "EXPIRED";
        await settlePayment({
          provider: providerName,
          providerRef: payment.externalRef,
          status,
          raw: { source: "reconcile", polled },
          deliveryId: `reconcile:${payment.id}:${status}`,
        });
        updated += 1;
        continue;
      }
      const status = await safeStatus(providerName, payment.externalRef);
      if (status === "SUCCESSFUL" || status === "FAILED") {
        await settlePayment({
          provider: providerName,
          providerRef: payment.externalRef,
          status,
          raw: { source: "reconcile" },
          deliveryId: `reconcile:${payment.id}:${status}`,
        });
        updated += 1;
      }
    } catch (error) {
      logger.warn({ err: error, paymentId: payment.id, provider: providerName }, "reconcile skipped payment");
    }
  }
  await sendMissingTicketSms();
  return { checked: pending.length, updated };
}

async function safeStatus(providerName: ProviderName, externalRef: string): Promise<string> {
  const result = await getProvider(providerName).getStatus(externalRef);
  return result.status;
}
