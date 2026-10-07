import "./vercel-env.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startReconcileJob, stopReconcileJob } from "./jobs/scheduler.js";
import { logger } from "./logger.js";
import { prepareDatabase } from "./prepare-db.js";
import { ensureSeed } from "./seed.js";

await prepareDatabase();
await ensureSeed();

const app = createApp();
export default app;

if (config.enableCron) startReconcileJob();
const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      mtnMode: config.mtnMode,
      airtelMode: config.airtelMode,
      paypalMode: config.paypalMode,
      smsMode: config.smsMode,
    },
    "USSD Ticket Pay API listening",
  );
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "shutting down");
  stopReconcileJob();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
