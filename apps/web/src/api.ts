export type Meta = {
  serviceCode: string;
  mtnMode: "mock" | "sandbox";
  airtelMode: "mock" | "sandbox";
  paypalMode: "mock" | "sandbox";
  smsMode: "console" | "sandbox";
  displayCurrency: string;
  sessionTtlSeconds: number;
};

export type OrderRow = {
  reference: string;
  phone: string;
  eventName: string;
  quantity: number;
  totalRwf: number;
  provider: string | null;
  paymentStatus: string | null;
  orderStatus: string;
  approvalUrl: string | null;
  ticketCode: string | null;
  currencyCharged: string;
  amountCharged: string | null;
  createdAt: string;
};

export type SmsRow = {
  id: string;
  to: string;
  body: string;
  provider: string;
  status: string;
  createdAt: string;
};

const adminSecret = import.meta.env.VITE_ADMIN_SECRET ?? "demo-admin";

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    return response.statusText;
  }
  return response.statusText;
}

export async function fetchMeta(): Promise<Meta> {
  const response = await fetch("/api/meta");
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as Meta;
}

export async function postUssd(input: {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  text: string;
  buyerName?: string;
}): Promise<string> {
  const body = new URLSearchParams(input);
  const response = await fetch("/ussd", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return response.text();
}

export async function fetchOrders(): Promise<OrderRow[]> {
  const response = await fetch("/api/orders", { headers: { "X-Admin-Secret": adminSecret } });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { orders: OrderRow[] };
  return payload.orders;
}

export async function fetchSms(): Promise<SmsRow[]> {
  const response = await fetch("/api/sms", { headers: { "X-Admin-Secret": adminSecret } });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { messages: SmsRow[] };
  return payload.messages;
}

export type TicketPass = {
  code: string;
  status: string;
  eventName: string;
  venue: string;
  startsAt: string;
  quantity: number;
  totalRwf: number;
  reference: string;
  buyerName: string | null;
  phone: string;
  admittedAt: string | null;
};

export function ticketCodeFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const fromPath = /\/t\/([A-Za-z0-9]{4,12})\/?$/.exec(url.pathname);
    if (fromPath?.[1]) return fromPath[1].toUpperCase();
  } catch {
    // A typed code is not a URL.
  }
  const legacy = /^ussdticket:v1:([A-Za-z0-9]{4,12}):/i.exec(text);
  if (legacy?.[1]) return legacy[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(text)) return text.toUpperCase();
  return null;
}

export async function fetchTicket(code: string): Promise<TicketPass> {
  const response = await fetch(`/api/tickets/${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as TicketPass;
}

export async function admitTicket(code: string): Promise<TicketPass> {
  const response = await fetch(`/api/tickets/${encodeURIComponent(code)}/admit`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as TicketPass;
}

export async function simulatePayment(
  reference: string,
  status: "SUCCESSFUL" | "FAILED",
): Promise<void> {
  const response = await fetch(`/api/payments/${encodeURIComponent(reference)}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": adminSecret,
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await readError(response));
}
