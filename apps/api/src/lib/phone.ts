export type MobileNetwork = "mtn" | "airtel";

export type NormalizedPhone = {
  e164: string;
  national: string;
  network: MobileNetwork;
};

/**
 * Rwanda mobile numbers:
 * 078/079 MTN, 072/073 Airtel. Accepts +250, 250, or a leading 0.
 */
const RWANDA_MOBILE = /^(?:\+?250|0)?(7(?:2|3|8|9)\d{7})$/;

export function normalizeRwandaPhone(input: string): NormalizedPhone | null {
  const compact = input.replace(/[\s-]/g, "");
  const match = RWANDA_MOBILE.exec(compact);
  const national = match?.[1];
  if (!national) return null;
  const prefix = national.slice(0, 2);
  const network: MobileNetwork = prefix === "78" || prefix === "79" ? "mtn" : "airtel";
  return {
    e164: `+250${national}`,
    national,
    network,
  };
}

/** +250781234567 -> +25078***4567 */
export function maskPhone(input: string): string {
  const normalized = normalizeRwandaPhone(input);
  const value = normalized?.e164 ?? input.trim();
  if (value.length < 10) return "***";
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}
