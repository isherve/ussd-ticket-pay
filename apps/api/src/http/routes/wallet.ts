import { Router } from "express";
import { z } from "zod";
import { getWallet, sendToWallet, splitWallet, topUp } from "../../wallet/service.js";
import { asyncRoute } from "../asyncRoute.js";

const phoneField = z.string().trim().min(8).max(20);
const amountField = z.number().int().min(1).max(1_000_000);
const keyField = z.string().trim().min(8).max(128);

const topupSchema = z.object({
  phone: phoneField,
  idempotencyKey: keyField,
  amountRwf: amountField.optional(),
});

const sendSchema = z.object({
  fromPhone: phoneField,
  toPhone: phoneField,
  amountRwf: amountField,
  idempotencyKey: keyField,
});

const splitSchema = z.object({
  fromPhone: phoneField,
  amountRwf: amountField,
  phones: z.array(phoneField).min(2).max(5),
  idempotencyKey: keyField,
});

export const walletRouter = Router();

walletRouter.get(
  "/api/wallet",
  asyncRoute(async (req, res) => {
    const phone = z.string().trim().min(8).max(20).parse(req.query.phone);
    res.json(await getWallet(phone));
  }),
);

walletRouter.post(
  "/api/wallet/topup",
  asyncRoute(async (req, res) => {
    const body = topupSchema.parse(req.body);
    res.json(await topUp(body));
  }),
);

walletRouter.post(
  "/api/wallet/send",
  asyncRoute(async (req, res) => {
    const body = sendSchema.parse(req.body);
    res.json(await sendToWallet(body));
  }),
);

walletRouter.post(
  "/api/wallet/split",
  asyncRoute(async (req, res) => {
    const body = splitSchema.parse(req.body);
    res.json(await splitWallet(body));
  }),
);
