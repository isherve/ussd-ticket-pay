import cron from "node-cron";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { reconcilePendingPayments } from "./reconcilePayments.js";

let task: cron.ScheduledTask | null = null;

export function startReconcileJob(): void {
  if (task) return;
  task = cron.schedule(config.reconcileCron, () => {
    void reconcilePendingPayments().catch((error: unknown) => {
      logger.error({ err: error }, "reconcile job failed");
    });
  });
  logger.info({ cron: config.reconcileCron }, "reconcile job scheduled");
}

export function stopReconcileJob(): void {
  task?.stop();
  task = null;
}
