import "./vercel-env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV !== "test") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot =
    path.basename(path.resolve(here, "..")) === "dist"
      ? path.resolve(here, "../..")
      : path.resolve(here, "..");
  const repoRoot = path.resolve(apiRoot, "../..");
  dotenv.config({ path: path.join(apiRoot, ".env") });
  dotenv.config({ path: path.join(repoRoot, ".env") });
  dotenv.config();
}

const nodeEnvSchema = z.enum(["development", "test", "production"]);
const modeSchema = z.enum(["mock", "sandbox"]);

const schema = z
  .object({
    NODE_ENV: nodeEnvSchema.default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    WEB_APP_URL: z.string().url().default("http://localhost:5173"),
    USSD_SERVICE_CODE: z.string().min(1).default("*384*123#"),
    USSD_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(120),
    USSD_PAGE_SIZE: z.coerce.number().int().min(1).max(5).default(3),
    WEBHOOK_SECRET: z.string().min(8).default("dev-webhook-secret"),
    ADMIN_SECRET: z.string().min(4).default("demo-admin"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    RECONCILE_CRON: z.string().min(1).default("*/1 * * * *"),
    RECONCILE_AFTER_MINUTES: z.coerce.number().int().positive().default(2),
    PAYMENT_EXPIRE_MINUTES: z.coerce.number().int().positive().default(15),
    ENABLE_CRON: z.enum(["true", "false"]).default("true"),
    MTN_MODE: modeSchema.default("mock"),
    MOMO_BASE_URL: z.string().url().default("https://sandbox.momodeveloper.mtn.com"),
    MOMO_SUBSCRIPTION_KEY: z.string().default(""),
    MOMO_API_USER: z.string().default(""),
    MOMO_API_KEY: z.string().default(""),
    MOMO_TARGET_ENV: z.string().min(1).default("sandbox"),
    MOMO_CURRENCY: z.string().min(3).default("EUR"),
    MOMO_RWF_PER_UNIT: z.coerce.number().positive().default(1400),
    MOMO_CALLBACK_HOST: z.string().min(1).default("localhost"),
    AIRTEL_MODE: modeSchema.default("mock"),
    AIRTEL_BASE_URL: z.string().url().default("https://openapiuat.airtel.africa"),
    AIRTEL_CLIENT_ID: z.string().default(""),
    AIRTEL_CLIENT_SECRET: z.string().default(""),
    AIRTEL_COUNTRY: z.string().min(2).default("UG"),
    AIRTEL_CURRENCY: z.string().min(3).default("UGX"),
    AIRTEL_RWF_PER_UNIT: z.coerce.number().positive().default(1),
    PAYPAL_MODE: modeSchema.default("mock"),
    PAYPAL_BASE_URL: z.string().url().default("https://api-m.sandbox.paypal.com"),
    PAYPAL_CLIENT_ID: z.string().default(""),
    PAYPAL_CLIENT_SECRET: z.string().default(""),
    PAYPAL_WEBHOOK_ID: z.string().default(""),
    PAYPAL_CURRENCY: z.string().min(3).default("USD"),
    PAYPAL_RWF_PER_UNIT: z.coerce.number().positive().default(1300),
    SMS_MODE: z.enum(["console", "sandbox"]).default("console"),
    AT_USERNAME: z.string().min(1).default("sandbox"),
    AT_API_KEY: z.string().default(""),
    AT_BASE_URL: z.string().url().default("https://api.sandbox.africastalking.com"),
    AT_SENDER_ID: z.string().default(""),
    MOCK_PAYMENT_RESULT: z.enum(["pending", "success", "fail"]).default("pending"),
    MOCK_PAYMENT_DELAY_MS: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    const requireKeys = (mode: string, keys: (keyof typeof env)[], label: string): void => {
      if (mode !== "sandbox") return;
      for (const key of keys) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when ${label}=sandbox (free sandbox credential)`,
          });
        }
      }
    };

    requireKeys(
      env.MTN_MODE,
      ["MOMO_SUBSCRIPTION_KEY", "MOMO_API_USER", "MOMO_API_KEY"],
      "MTN_MODE",
    );
    requireKeys(env.AIRTEL_MODE, ["AIRTEL_CLIENT_ID", "AIRTEL_CLIENT_SECRET"], "AIRTEL_MODE");
    requireKeys(env.PAYPAL_MODE, ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], "PAYPAL_MODE");
    if (env.SMS_MODE === "sandbox" && !env.AT_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AT_API_KEY"],
        message: "AT_API_KEY is required when SMS_MODE=sandbox",
      });
    }
    if (env.NODE_ENV === "production" && env.WEBHOOK_SECRET === "dev-webhook-secret") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEBHOOK_SECRET"],
        message: "Replace the default WEBHOOK_SECRET before production",
      });
    }
    if (env.NODE_ENV === "production" && env.ADMIN_SECRET === "demo-admin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_SECRET"],
        message: "Replace the default ADMIN_SECRET before production",
      });
    }
  });

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  corsOrigins: string[];
  publicBaseUrl: string;
  webAppUrl: string;
  ussdServiceCode: string;
  ussdSessionTtlSeconds: number;
  ussdPageSize: number;
  webhookSecret: string;
  adminSecret: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  reconcileCron: string;
  reconcileAfterMinutes: number;
  paymentExpireMinutes: number;
  enableCron: boolean;
  mtnMode: "mock" | "sandbox";
  momoBaseUrl: string;
  momoSubscriptionKey: string;
  momoApiUser: string;
  momoApiKey: string;
  momoTargetEnv: string;
  momoCurrency: string;
  momoRwfPerUnit: number;
  momoCallbackHost: string;
  airtelMode: "mock" | "sandbox";
  airtelBaseUrl: string;
  airtelClientId: string;
  airtelClientSecret: string;
  airtelCountry: string;
  airtelCurrency: string;
  airtelRwfPerUnit: number;
  paypalMode: "mock" | "sandbox";
  paypalBaseUrl: string;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalWebhookId: string;
  paypalCurrency: string;
  paypalRwfPerUnit: number;
  smsMode: "console" | "sandbox";
  atUsername: string;
  atApiKey: string;
  atBaseUrl: string;
  atSenderId: string;
  mockPaymentResult: "pending" | "success" | "fail";
  mockPaymentDelayMs: number;
};

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readEnv(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const keys = [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "LOG_LEVEL",
    "CORS_ORIGIN",
    "PUBLIC_BASE_URL",
    "WEB_APP_URL",
    "USSD_SERVICE_CODE",
    "USSD_SESSION_TTL_SECONDS",
    "USSD_PAGE_SIZE",
    "WEBHOOK_SECRET",
    "ADMIN_SECRET",
    "RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_MAX",
    "RECONCILE_CRON",
    "RECONCILE_AFTER_MINUTES",
    "PAYMENT_EXPIRE_MINUTES",
    "ENABLE_CRON",
    "MTN_MODE",
    "MOMO_BASE_URL",
    "MOMO_SUBSCRIPTION_KEY",
    "MOMO_API_USER",
    "MOMO_API_KEY",
    "MOMO_TARGET_ENV",
    "MOMO_CURRENCY",
    "MOMO_RWF_PER_UNIT",
    "MOMO_CALLBACK_HOST",
    "AIRTEL_MODE",
    "AIRTEL_BASE_URL",
    "AIRTEL_CLIENT_ID",
    "AIRTEL_CLIENT_SECRET",
    "AIRTEL_COUNTRY",
    "AIRTEL_CURRENCY",
    "AIRTEL_RWF_PER_UNIT",
    "PAYPAL_MODE",
    "PAYPAL_BASE_URL",
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_WEBHOOK_ID",
    "PAYPAL_CURRENCY",
    "PAYPAL_RWF_PER_UNIT",
    "SMS_MODE",
    "AT_USERNAME",
    "AT_API_KEY",
    "AT_BASE_URL",
    "AT_SENDER_ID",
    "MOCK_PAYMENT_RESULT",
    "MOCK_PAYMENT_DELAY_MS",
  ] as const;
  const record: Record<string, string | undefined> = {};
  for (const key of keys) {
    record[key] = blankToUndefined(source[key]);
  }
  return record;
}

export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(readEnv(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `- ${path}: ${issue.message}`;
    });
    throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ""),
    webAppUrl: env.WEB_APP_URL.replace(/\/$/, ""),
    ussdServiceCode: env.USSD_SERVICE_CODE,
    ussdSessionTtlSeconds: env.USSD_SESSION_TTL_SECONDS,
    ussdPageSize: env.USSD_PAGE_SIZE,
    webhookSecret: env.WEBHOOK_SECRET,
    adminSecret: env.ADMIN_SECRET,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    reconcileCron: env.RECONCILE_CRON,
    reconcileAfterMinutes: env.RECONCILE_AFTER_MINUTES,
    paymentExpireMinutes: env.PAYMENT_EXPIRE_MINUTES,
    enableCron: env.ENABLE_CRON === "true" && env.NODE_ENV !== "test",
    mtnMode: env.MTN_MODE,
    momoBaseUrl: env.MOMO_BASE_URL.replace(/\/$/, ""),
    momoSubscriptionKey: env.MOMO_SUBSCRIPTION_KEY,
    momoApiUser: env.MOMO_API_USER,
    momoApiKey: env.MOMO_API_KEY,
    momoTargetEnv: env.MOMO_TARGET_ENV,
    momoCurrency: env.MOMO_CURRENCY,
    momoRwfPerUnit: env.MOMO_RWF_PER_UNIT,
    momoCallbackHost: env.MOMO_CALLBACK_HOST,
    airtelMode: env.AIRTEL_MODE,
    airtelBaseUrl: env.AIRTEL_BASE_URL.replace(/\/$/, ""),
    airtelClientId: env.AIRTEL_CLIENT_ID,
    airtelClientSecret: env.AIRTEL_CLIENT_SECRET,
    airtelCountry: env.AIRTEL_COUNTRY,
    airtelCurrency: env.AIRTEL_CURRENCY,
    airtelRwfPerUnit: env.AIRTEL_RWF_PER_UNIT,
    paypalMode: env.PAYPAL_MODE,
    paypalBaseUrl: env.PAYPAL_BASE_URL.replace(/\/$/, ""),
    paypalClientId: env.PAYPAL_CLIENT_ID,
    paypalClientSecret: env.PAYPAL_CLIENT_SECRET,
    paypalWebhookId: env.PAYPAL_WEBHOOK_ID,
    paypalCurrency: env.PAYPAL_CURRENCY,
    paypalRwfPerUnit: env.PAYPAL_RWF_PER_UNIT,
    smsMode: env.SMS_MODE,
    atUsername: env.AT_USERNAME,
    atApiKey: env.AT_API_KEY,
    atBaseUrl: env.AT_BASE_URL.replace(/\/$/, ""),
    atSenderId: env.AT_SENDER_ID,
    mockPaymentResult: env.MOCK_PAYMENT_RESULT,
    mockPaymentDelayMs: env.MOCK_PAYMENT_DELAY_MS,
  };
}

export const config = loadConfig(process.env);
