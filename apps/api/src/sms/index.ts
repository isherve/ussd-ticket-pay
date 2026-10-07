import type { SmsService } from "./types.js";
import { config } from "../config.js";
import { AfricasTalkingSms } from "./africastalking.js";
import { ConsoleSms } from "./consoleSms.js";

let singleton: SmsService | null = null;

export function getSmsService(): SmsService {
  if (singleton) return singleton;
  singleton = config.smsMode === "sandbox" ? new AfricasTalkingSms() : new ConsoleSms();
  return singleton;
}
