export const USSD_MAX_CHARS = 182;

export class UssdLengthError extends Error {
  readonly length: number;

  constructor(length: number) {
    super(`USSD screen is ${length} characters (max ${USSD_MAX_CHARS})`);
    this.name = "UssdLengthError";
    this.length = length;
  }
}

/** Rejects a screen that would be dropped or truncated by the USSD gateway. */
export function assertUssdLength(text: string): string {
  if (text.length > USSD_MAX_CHARS) {
    throw new UssdLengthError(text.length);
  }
  return text;
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}
