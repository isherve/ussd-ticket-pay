import { Router } from "express";
import { z } from "zod";
import { logger } from "../../logger.js";
import { handleUssdSession } from "../../ussd/session.js";
import { asyncRoute } from "../asyncRoute.js";

const ussdSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  serviceCode: z.string().trim().min(1).max(32),
  phoneNumber: z.string().trim().min(8).max(20),
  text: z.string().max(600).optional().default(""),
  networkCode: z.string().max(32).optional(),
  buyerName: z.string().trim().max(40).optional(),
});

export const ussdRouter = Router();

ussdRouter.post(
  "/ussd",
  asyncRoute(async (req, res) => {
    const parsed = ussdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.type("text/plain").status(200).send("END Invalid request.");
      return;
    }
    try {
      const body = await handleUssdSession({
        sessionId: parsed.data.sessionId,
        phoneNumber: parsed.data.phoneNumber,
        text: parsed.data.text,
        buyerName: parsed.data.buyerName,
      });
      res.type("text/plain").status(200).send(body);
    } catch (error) {
      logger.error({ err: error, sessionId: parsed.data.sessionId }, "ussd handler failed");
      res.type("text/plain").status(200).send("END Service temporarily unavailable.");
    }
  }),
);
