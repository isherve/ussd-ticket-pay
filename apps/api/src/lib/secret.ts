import { timingSafeEqual } from "node:crypto";

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
