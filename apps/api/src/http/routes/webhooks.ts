import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";
import { headerValue, safeEqual } from "../../lib/secret.js";
import { assertProviderName, assertSimulationAllowed, settlePayment } from "../../payments/service.js";
import { getProvider } from "../../payments/registry.js";
import { MockProvider } from "../../payments/providers/mock.js";
import { PayPalProvider, mapPaypalOrder } from "../../payments/providers/paypal.js";
import { readString } from "../../payments/http.js";
import { prisma } from "../../db.js";
import { asyncRoute } from "../asyncRoute.js";

export const webhookRouter = Router();

function requireToken(provided: string): void {
  if (!safeEqual(provided, config.webhookSecret)) {
    throw new AppError("Invalid callback token.", 401, "invalid_callback_token");
  }
}

webhookRouter.post(
  "/webhooks/mock",
  asyncRoute(async (req, res) => {
    requireToken(headerValue(req.headers, "x-callback-token"));
    const update = await new MockProvider("mtn", "pending", 0).handleWebhook(req.headers, req.body);
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ externalRef: update.providerRef }, { order: { reference: update.providerRef } }],
      },
    });
    if (!payment) throw new AppError("Unknown payment reference.", 404, "unknown_payment");
    const provider = assertProviderName(payment.provider);
    assertSimulationAllowed(provider);
    const settled = await settlePayment({
      provider,
      providerRef: update.providerRef,
      status: update.status,
      raw: update.raw,
      deliveryId: update.deliveryId,
    });
    res.status(200).json({ ok: true, duplicate: settled.duplicate, ticketCode: settled.ticketCode });
  }),
);

webhookRouter.post(
  "/webhooks/mtn",
  asyncRoute(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    requireToken(token);
    if (config.mtnMode !== "sandbox") {
      throw new AppError("MTN sandbox mode is off.", 409, "mtn_mock_mode");
    }
    const update = await getProvider("mtn").handleWebhook(req.headers, req.body);
    const settled = await settlePayment({
      provider: "mtn",
      providerRef: update.providerRef,
      status: update.status,
      raw: update.raw,
      deliveryId: `mtn:${update.deliveryId}`,
    });
    res.status(200).json({ ok: true, duplicate: settled.duplicate });
  }),
);

webhookRouter.post(
  "/webhooks/airtel",
  asyncRoute(async (req, res) => {
    requireToken(headerValue(req.headers, "x-callback-token"));
    if (config.airtelMode !== "sandbox") {
      throw new AppError("Airtel sandbox mode is off.", 409, "airtel_mock_mode");
    }
    const update = await getProvider("airtel").handleWebhook(req.headers, req.body);
    const settled = await settlePayment({
      provider: "airtel",
      providerRef: update.providerRef,
      status: update.status,
      raw: update.raw,
      deliveryId: `airtel:${update.deliveryId}`,
    });
    res.status(200).json({ ok: true, duplicate: settled.duplicate });
  }),
);

webhookRouter.post(
  "/webhooks/paypal",
  asyncRoute(async (req, res) => {
    if (config.paypalMode !== "sandbox") {
      throw new AppError("PayPal sandbox mode is off.", 409, "paypal_mock_mode");
    }
    const provider = getProvider("paypal");
    if (!(provider instanceof PayPalProvider)) {
      throw new AppError("PayPal provider is not active.", 409, "paypal_inactive");
    }
    if (!config.paypalWebhookId) {
      requireToken(headerValue(req.headers, "x-callback-token"));
    }
    const update = await provider.handleWebhook(req.headers, req.body);
    const settled = await settlePayment({
      provider: "paypal",
      providerRef: update.providerRef,
      status: update.status,
      raw: update.raw,
      deliveryId: `paypal:${update.deliveryId}`,
    });
    res.status(200).json({ ok: true, duplicate: settled.duplicate });
  }),
);

const returnSchema = z.object({ token: z.string().min(1) });

webhookRouter.get(
  "/payments/paypal/return",
  asyncRoute(async (req, res) => {
    const query = returnSchema.parse(req.query);
    const provider = getProvider("paypal");
    if (!(provider instanceof PayPalProvider)) {
      res.redirect(`${config.webAppUrl}/pay/result?status=mock`);
      return;
    }
    try {
      const captured = await provider.capture(query.token);
      const status = mapPaypalOrder(readString(captured, "status"));
      if (status === "SUCCESSFUL" || status === "FAILED") {
        await settlePayment({
          provider: "paypal",
          providerRef: query.token,
          status,
          raw: captured,
          deliveryId: `paypal-return:${query.token}:${status}`,
        });
      }
      const page = status === "SUCCESSFUL" ? "success" : status === "FAILED" ? "failed" : "pending";
      res.redirect(`${config.webAppUrl}/pay/result?status=${page}&ref=${encodeURIComponent(query.token)}`);
    } catch {
      res.redirect(`${config.webAppUrl}/pay/result?status=failed`);
    }
  }),
);

webhookRouter.get(
  "/payments/paypal/cancel",
  asyncRoute(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (token) {
      await settlePayment({
        provider: "paypal",
        providerRef: token,
        status: "FAILED",
        raw: { source: "paypal_cancel" },
        deliveryId: `paypal-cancel:${token}`,
      }).catch(() => undefined);
    }
    res.redirect(`${config.webAppUrl}/pay/result?status=cancelled`);
  }),
);
