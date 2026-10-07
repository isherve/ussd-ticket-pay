import { prisma } from "../db.js";
import { maskPhone } from "../lib/phone.js";
import { logger } from "../logger.js";
import type { OutboundSms, SmsService } from "./types.js";

export class ConsoleSms implements SmsService {
  readonly name = "console";

  async send(message: OutboundSms): Promise<"SENT" | "FAILED"> {
    logger.info({ to: maskPhone(message.to), ticketId: message.ticketId }, "sms (console)");
    await prisma.smsLog.create({
      data: {
        toPhone: message.to,
        body: message.body,
        provider: this.name,
        status: "SENT",
        ticketId: message.ticketId,
        orderId: message.orderId,
      },
    });
    return "SENT";
  }
}
