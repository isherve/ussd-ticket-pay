import { config } from "../config.js";
import type { PaymentChoice } from "../ussd/types.js";

/**
 * User-facing prices stay in RWF. Sandbox providers are charged in their own
 * currency using an illustrative rate (not a live FX feed).
 * MTN sandbox collections use EUR. Whole-number amounts are sent because
 * several sandbox examples reject or ignore fractional strings. PayPal Orders
 * v2 requires a decimal string with two places.
 */
export function providerCharge(
  totalRwf: number,
  provider: PaymentChoice,
): { amount: string; currency: string } {
  if (provider === "mtn" && config.mtnMode === "sandbox") {
    const units = Math.max(1, Math.round(totalRwf / config.momoRwfPerUnit));
    return { amount: String(units), currency: config.momoCurrency };
  }
  if (provider === "paypal" && config.paypalMode === "sandbox") {
    const units = Math.max(0.01, totalRwf / config.paypalRwfPerUnit);
    return { amount: units.toFixed(2), currency: config.paypalCurrency };
  }
  if (provider === "airtel" && config.airtelMode === "sandbox") {
    const units = Math.max(1, Math.round(totalRwf / config.airtelRwfPerUnit));
    return { amount: String(units), currency: config.airtelCurrency };
  }
  return { amount: String(totalRwf), currency: "RWF" };
}
