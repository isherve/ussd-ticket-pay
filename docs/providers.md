# Provider notes

These are the endpoints the adapters call. Each one is skipped unless the matching `*_MODE=sandbox` (or `SMS_MODE=sandbox`) and the keys in `.env.example` are set.

## Africa's Talking USSD

The gateway POSTs `application/x-www-form-urlencoded` to the callback you register:

- `sessionId`, `phoneNumber`, `serviceCode`, `text`, and usually `networkCode`
- `text` is empty on the first hit, then a `*`-separated history (`1*2*1`)

The response is `text/plain` and must start with `CON ` or `END `. A 4xx from your server ends the session, so this app answers `200` with `END` even when the menu input is invalid.

Sandbox SMS uses `POST https://api.sandbox.africastalking.com/version1/messaging` with header `apiKey` and a form body (`username`, `to`, `message`, optional `from`). The sandbox username is the word `sandbox`. Messages show in the Africa's Talking simulator, not on a handset.

## MTN MoMo Collections sandbox

Base URL: `https://sandbox.momodeveloper.mtn.com`

| Step | Request |
| --- | --- |
| API user | `POST /v1_0/apiuser` with `X-Reference-Id` and `Ocp-Apim-Subscription-Key`. Body `{ "providerCallbackHost": "hostname" }`. Expect 201. |
| API key | `POST /v1_0/apiuser/{referenceId}/apikey`. Expect 201 `{ "apiKey" }`. `npm run momo:setup` does both. |
| Token | `POST /collection/token/` with HTTP Basic (`apiUser:apiKey`) and the subscription key. Cache `access_token` until `expires_in`. |
| Request to pay | `POST /collection/v1_0/requesttopay` with `Authorization: Bearer`, `X-Reference-Id`, `X-Target-Environment: sandbox`, `Ocp-Apim-Subscription-Key`, optional `X-Callback-Url`. Body `amount`, `currency`, `externalId`, `payer.partyIdType=MSISDN`, `payer.partyId`. Expect 202. |
| Status | `GET /collection/v1_0/requesttopay/{referenceId}` → `PENDING`, `SUCCESSFUL`, or `FAILED`. |

Sandbox currency is EUR. Use the test MSISDNs published at <https://momodeveloper.mtn.com/api-documentation/testing>. A number that is not on that list often auto-succeeds, which is easy to misread as a real approval.

The public collection docs describe the callback body (`status`, `externalId`, `financialTransactionId`) but do not document an HMAC. This app puts `WEBHOOK_SECRET` on the callback URL as `?token=` because that URL is one we choose via `X-Callback-Url`. Polling remains the reliable path and is what the reconcile job does.

Amount strings are whole major units (minimum 1). Some sandbox examples use decimals such as `"0.5"` and some collections reject them. If a sandbox call fails on amount format, that is the first thing to check.

## Airtel Money collection

Sandbox host used by Airtel's open API examples: `https://openapiuat.airtel.africa`

| Step | Request |
| --- | --- |
| Token | `POST /auth/oauth2/token` JSON `{ client_id, client_secret, grant_type: "client_credentials" }`. |
| USSD push | `POST /merchant/v1/payments/` with `Authorization`, `X-Country`, `X-Currency`. Body `reference`, `subscriber` (`country`, `currency`, `msisdn`), `transaction` (`amount`, `country`, `currency`, `id`). |
| Enquiry | `GET /standard/v1/payments/{id}` with the same country and currency headers. |

Status codes `TS` (success), `TF` (failed), `TIP` (in progress), and `TA` (ambiguous) come from Airtel collection examples and their community SDKs. Ambiguous stays `PENDING` so the reconcile job can poll again. The callback JSON wrapper differs by country. The parser accepts a `transaction` object nested under `data` or at the top level. Treat that as best-effort, not a guarantee for every market.

`msisdn` is sent as the national number without a country code, which matches the published examples. `X-Country` and `X-Currency` must be a market your developer app actually has. This project defaults them to `UG` / `UGX` because a Rwanda sandbox is not something every Airtel developer account includes. The USSD menu still shows RWF.

Airtel does not document one shared callback signature for every country. `/webhooks/airtel` requires `X-Callback-Token`. A real Airtel callback will not send that header unless you front the route with a proxy that adds it, or you confirm the hash scheme for your market and extend `AirtelMoneyProvider.handleWebhook`.

## PayPal Orders v2 sandbox

Base URL: `https://api-m.sandbox.paypal.com`

| Step | Request |
| --- | --- |
| Token | `POST /v1/oauth2/token` with HTTP Basic and `grant_type=client_credentials`. |
| Create | `POST /v2/checkout/orders` with `intent: CAPTURE`. The approval URL is the link whose `rel` is `approve`, or `payer-action` when `payment_source` is set. |
| Capture | `POST /v2/checkout/orders/{id}/capture` after the buyer approves. The return handler and `CHECKOUT.ORDER.APPROVED` both capture. |
| Verify | `POST /v1/notifications/verify-webhook-signature` when `PAYPAL_WEBHOOK_ID` is set. |

`custom_id` is the short reference printed on the USSD screen. The PayPal order id is stored as `Payment.externalRef`. Capture webhooks are matched on `resource.supplementary_data.related_ids.order_id`, then `custom_id`.

PayPal's verify call wants the event JSON. Re-serializing a parsed body can change key order. The post-back verify API is the supported approach used here. If verification fails in the sandbox, compare it with PayPal's raw-body CRC32 method before changing the handler.
