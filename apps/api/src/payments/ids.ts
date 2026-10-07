import { createHash, randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function fromAlphabet(size: number): string {
  const bytes = randomBytes(size);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length] ?? "A";
  }
  return out;
}

export function makeReference(): string {
  return fromAlphabet(8);
}

export function makeTicketCode(): string {
  return fromAlphabet(6);
}

export function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value) ?? "";
    return text.length > 4000 ? text.slice(0, 4000) : text;
  } catch {
    return "{}";
  }
}

export function deliveryIdFrom(provider: string, body: unknown, fallback: string): string {
  const digest = createHash("sha256").update(`${provider}:${fallback}:${safeJson(body)}`).digest("hex");
  return digest.slice(0, 32);
}
