if (process.env.VERCEL === "1") {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const origin = host ? `https://${host}` : "https://localhost";
  process.env.DATABASE_URL ??= "file:/tmp/ussd.db";
  process.env.WEBHOOK_SECRET ??= "recruit-demo-webhook";
  process.env.ADMIN_SECRET ??= "recruit-demo-admin";
  process.env.PUBLIC_BASE_URL ??= origin;
  process.env.WEB_APP_URL ??= origin;
  process.env.CORS_ORIGIN ??= origin;
  process.env.ENABLE_CRON ??= "false";
  process.env.SMS_MODE ??= "console";
  process.env.MTN_MODE ??= "mock";
  process.env.AIRTEL_MODE ??= "mock";
  process.env.PAYPAL_MODE ??= "mock";
}
