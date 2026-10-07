import { Router } from "express";
import { prisma } from "../../db.js";
import { asyncRoute } from "../asyncRoute.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncRoute(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: "up", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "error", db: "down" });
    }
  }),
);
