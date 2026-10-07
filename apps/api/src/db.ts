import { PrismaClient } from "@prisma/client";
import { config } from "./config.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: config.nodeEnv === "development" ? ["warn", "error"] : ["error"],
});
