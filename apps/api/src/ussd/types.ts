import type { MobileNetwork } from "../lib/phone.js";

export const screenIds = [
  "welcome",
  "events",
  "quantity",
  "payment",
  "confirm",
  "tickets",
  "help",
  "wallet",
  "sendPhone",
  "sendAmount",
  "sendConfirm",
  "splitAmount",
  "splitPeople",
  "splitConfirm",
  "topupAmount",
] as const;

export type ScreenId = (typeof screenIds)[number];

export type PaymentChoice = "mtn" | "airtel" | "paypal" | "wallet";

export type SessionData = {
  eventPage: number;
  eventId?: string;
  eventName?: string;
  unitPriceRwf?: number;
  quantity?: number;
  provider?: PaymentChoice;
  walletAmount?: number;
  recipients?: string[];
};

export type EventChoice = {
  id: string;
  shortName: string;
  priceRwf: number;
};

export type PurchaseLine = {
  label: string;
  status: string;
  code?: string;
};

export type StartPaymentInput = {
  phone: string;
  eventId: string;
  quantity: number;
  provider: PaymentChoice;
  idempotencyKey?: string;
};

export type WalletMoveResult = {
  reference: string;
  amountRwf: number;
  shareRwf: number;
  remainderRwf: number;
  balanceRwf: number;
  duplicate: boolean;
};

export type UssdDeps = {
  listEvents(
    page: number,
    pageSize: number,
  ): Promise<{ items: EventChoice[]; page: number; pages: number }>;
  listPurchases(phone: string): Promise<PurchaseLine[]>;
  startPayment(input: StartPaymentInput): Promise<{
    reference: string;
    ticketCode?: string;
    duplicate?: boolean;
  }>;
  walletBalance(phone: string): Promise<number>;
  walletTopUp(input: {
    phone: string;
    idempotencyKey: string;
    amountRwf?: number;
  }): Promise<WalletMoveResult>;
  walletSend(input: {
    fromPhone: string;
    toPhone: string;
    amountRwf: number;
    idempotencyKey: string;
  }): Promise<WalletMoveResult>;
  walletSplit(input: {
    fromPhone: string;
    amountRwf: number;
    phones: string[];
    idempotencyKey: string;
  }): Promise<WalletMoveResult>;
};

export type ScreenContext = {
  phone: string;
  network: MobileNetwork;
  data: SessionData;
  deps: UssdDeps;
  pageSize: number;
  requestKey: string;
};

export type ScreenStep =
  | { type: "stay"; notice?: string; data?: SessionData }
  | { type: "goto"; screen: ScreenId; notice?: string; data?: SessionData }
  | { type: "end"; message: string };

export type UssdScreen = {
  id: ScreenId;
  show(ctx: ScreenContext): Promise<string>;
  onInput(input: string, ctx: ScreenContext): Promise<ScreenStep>;
};

export function emptySessionData(): SessionData {
  return { eventPage: 0 };
}
