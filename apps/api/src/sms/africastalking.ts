import { config } from "../config.js";
import { prisma } from "../db.js";
import { maskPhone } from "../lib/phone.js";
import { logger } from "../logger.js";
import { readJson } from "../payments/http.js";
import type { OutboundSms, SmsService } from "./types.js";

/**
 * Africa's Talking sandbox SMS.
 * POST https://api.sandbox.africastalking.com/version1/messaging
 * Header apiKey, form body username + to + message.
 * Sandbox traffic shows in the AT simulator, not on a real handset.
 * Docs: https://developers.africastalking.com/docs/sms/sending/bulk
 */
export class AfricasTalkingSms implements SmsService {
  readonly name = "africastalking";

  async send(message: OutboundSms): Promise<"SENT" | "FAILED"> {
    const params = new URLSearchParams({
      username: config.atUsername,
      to: message.to,
      message: message.body,
    });
    if (config.atSenderId) params.set("from", config.atSenderId);
    let status: "SENT" | "FAILED" = "FAILED";
    try {
      const response = await fetch(`${config.atBaseUrl}/version1/messaging`, {
        method: "POST",
        headers: {
          apiKey: config.atApiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: AbortSignal.timeout(15_000),
      });
      const body = await readJson(response);
      status = response.ok ? "SENT" : "FAILED";
      logger.info({ to: maskPhone(message.to), httpStatus: response.status, status }, "sms (africastalking)");
      if (!response.ok) logger.warn({ body }, "africastalking sms rejected");
    } catch (error) {
      logger.error({ err: error, to: maskPhone(message.to) }, "africastalking sms failed");
    }
    await prisma.smsLog.create({
      data: {
        toPhone: message.to,
        body: message.body,
        provider: this.name,
        status,
        ticketId: message.ticketId,
        orderId: message.orderId,
      },
    });
    return status;
  }
}
