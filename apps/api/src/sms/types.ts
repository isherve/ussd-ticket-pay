export type OutboundSms = {
  to: string;
  body: string;
  ticketId?: string;
  orderId?: string;
};

export interface SmsService {
  readonly name: string;
  send(message: OutboundSms): Promise<"SENT" | "FAILED">;
}

export function ticketSms(input: {
  eventName: string;
  quantity: number;
  code: string;
  reference: string;
}): string {
  return `USSD Ticket Pay\n${input.eventName} x${input.quantity}\nCode: ${input.code}\nRef: ${input.reference}`;
}

export function approvalSms(reference: string, url: string): string {
  return `USSD Ticket Pay\nApprove payment ${reference}:\n${url}`;
}
