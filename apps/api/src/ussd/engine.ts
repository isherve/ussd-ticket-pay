import { assertUssdLength, USSD_MAX_CHARS } from "../lib/ussdLimit.js";
import { screens } from "./screens/index.js";
import { newSegments } from "./text.js";
import { emptySessionData, type ScreenContext, type ScreenId, type SessionData } from "./types.js";

export type EngineSession = {
  state: ScreenId;
  data: SessionData;
  lastText: string;
  expiresAt: Date;
};

export type EngineResult = {
  body: string;
  end: boolean;
  session: EngineSession | null;
};

function withNotice(notice: string | undefined, body: string): string {
  if (!notice) return assertUssdLength(body);
  const combined = `${notice}\n${body}`;
  if (combined.length <= USSD_MAX_CHARS) return combined;
  const room = Math.max(0, USSD_MAX_CHARS - notice.length - 1);
  return `${notice}\n${body.slice(0, room)}`;
}

export async function runUssd(input: {
  session: EngineSession | null;
  expired: boolean;
  text: string;
  now: Date;
  ttlMs: number;
  ctx: Omit<ScreenContext, "data">;
}): Promise<EngineResult> {
  if (input.expired) {
    return {
      body: `END ${assertUssdLength("Session expired. Dial again.")}`,
      end: true,
      session: null,
    };
  }

  const session: EngineSession = input.session ?? {
    state: "welcome",
    data: emptySessionData(),
    lastText: "",
    expiresAt: new Date(input.now.getTime() + input.ttlMs),
  };

  let screen: ScreenId = session.state;
  let data: SessionData = session.data;
  const segments = newSegments(session.lastText, input.text);
  let notice: string | undefined;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    const step = await screens[screen].onInput(segment, { ...input.ctx, data });
    if (step.type !== "end" && step.data) data = step.data;
    if (step.type === "end") {
      return {
        body: `END ${assertUssdLength(step.message)}`,
        end: true,
        session: null,
      };
    }
    if (step.type === "stay") {
      notice = step.notice;
      break;
    }
    screen = step.screen;
    notice = index === segments.length - 1 ? step.notice : undefined;
  }

  const body = await screens[screen].show({ ...input.ctx, data });
  return {
    body: `CON ${withNotice(notice, body)}`,
    end: false,
    session: {
      state: screen,
      data,
      lastText: input.text,
      expiresAt: new Date(input.now.getTime() + input.ttlMs),
    },
  };
}

export function parseSessionData(raw: string): SessionData {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptySessionData();
    const record = parsed as Record<string, unknown>;
    const page = record.eventPage;
    return {
      eventPage: typeof page === "number" && Number.isInteger(page) && page >= 0 ? page : 0,
      eventId: typeof record.eventId === "string" ? record.eventId : undefined,
      eventName: typeof record.eventName === "string" ? record.eventName : undefined,
      unitPriceRwf: typeof record.unitPriceRwf === "number" ? record.unitPriceRwf : undefined,
      quantity: typeof record.quantity === "number" ? record.quantity : undefined,
      provider:
        record.provider === "mtn" || record.provider === "airtel" || record.provider === "paypal"
          ? record.provider
          : undefined,
    };
  } catch {
    return emptySessionData();
  }
}

export function isScreenId(value: string): value is ScreenId {
  return (
    value === "welcome" ||
    value === "events" ||
    value === "quantity" ||
    value === "payment" ||
    value === "confirm" ||
    value === "tickets" ||
    value === "help"
  );
}
