import { describe, expect, it } from "vitest";
import { maskPhone, normalizeRwandaPhone } from "../src/lib/phone.js";
import { assertUssdLength, UssdLengthError } from "../src/lib/ussdLimit.js";

describe("Rwandan phone numbers", () => {
  it("normalizes MTN 078 and 079 to E.164", () => {
    expect(normalizeRwandaPhone("0788123456")).toEqual({
      e164: "+250788123456",
      national: "788123456",
      network: "mtn",
    });
    expect(normalizeRwandaPhone("+250 799 123 456")?.network).toBe("mtn");
    expect(normalizeRwandaPhone("250788123456")?.e164).toBe("+250788123456");
  });

  it("normalizes Airtel 072 and 073", () => {
    expect(normalizeRwandaPhone("0728123456")?.network).toBe("airtel");
    expect(normalizeRwandaPhone("+250738123456")).toMatchObject({
      e164: "+250738123456",
      network: "airtel",
    });
  });

  it("rejects prefixes outside 072, 073, 078, and 079", () => {
    expect(normalizeRwandaPhone("+250701234567")).toBeNull();
    expect(normalizeRwandaPhone("+250771234567")).toBeNull();
    expect(normalizeRwandaPhone("12345")).toBeNull();
  });

  it("masks the subscriber number", () => {
    expect(maskPhone("+250788123456")).toBe("+25078***3456");
    expect(maskPhone("0788123456")).toBe("+25078***3456");
  });
});

describe("USSD length", () => {
  it("accepts a screen within 182 characters", () => {
    expect(assertUssdLength("Hello")).toBe("Hello");
  });

  it("rejects a screen over 182 characters", () => {
    expect(() => assertUssdLength("x".repeat(183))).toThrow(UssdLengthError);
  });
});
