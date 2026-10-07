import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

/**
 * Provisions an MTN MoMo sandbox API user and API key.
 * Docs: https://momodeveloper.mtn.com/api-documentation
 * POST /v1_0/apiuser  (201, header X-Reference-Id)
 * POST /v1_0/apiuser/{referenceId}/apikey  (201, { apiKey })
 * The subscription key is the free Collections primary key from the developer portal.
 */
const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY?.trim() ?? "";
const baseUrl = (process.env.MOMO_BASE_URL ?? "https://sandbox.momodeveloper.mtn.com").replace(/\/$/, "");
const callbackHost = process.env.MOMO_CALLBACK_HOST?.trim() || "localhost";

if (!subscriptionKey) {
  console.error(
    "Set MOMO_SUBSCRIPTION_KEY. Create a free account at https://momodeveloper.mtn.com/, subscribe to Collections, and copy the Primary key.",
  );
  process.exit(1);
}

const referenceId = randomUUID();
const createUser = await fetch(`${baseUrl}/v1_0/apiuser`, {
  method: "POST",
  headers: {
    "X-Reference-Id": referenceId,
    "Ocp-Apim-Subscription-Key": subscriptionKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ providerCallbackHost: callbackHost }),
});

if (createUser.status !== 201) {
  const detail = await createUser.text();
  console.error(`Creating the API user failed (${createUser.status}). ${detail.slice(0, 400)}`);
  console.error("providerCallbackHost must be a hostname without a scheme, for example your ngrok host.");
  process.exit(1);
}

const createKey = await fetch(`${baseUrl}/v1_0/apiuser/${referenceId}/apikey`, {
  method: "POST",
  headers: { "Ocp-Apim-Subscription-Key": subscriptionKey },
});
const keyBody: unknown = await createKey.json().catch(() => null);
const apiKey =
  keyBody && typeof keyBody === "object" && "apiKey" in keyBody && typeof keyBody.apiKey === "string"
    ? keyBody.apiKey
    : "";

if (createKey.status !== 201 || !apiKey) {
  console.error(`Creating the API key failed (${createKey.status}).`);
  process.exit(1);
}

console.log("Sandbox API user created. Add these to .env and set MTN_MODE=sandbox:");
console.log(`MOMO_API_USER=${referenceId}`);
console.log(`MOMO_API_KEY=${apiKey}`);
console.log("Sandbox collections use EUR and the test MSISDNs listed at https://momodeveloper.mtn.com/api-documentation/testing");
