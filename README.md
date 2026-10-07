# USSD Ticket Pay

A person dials `*384*123#`, picks an event, pays with MTN MoMo, Airtel Money, or PayPal, and gets a ticket code by SMS. This repository is a recruiter demo of that flow. It runs with **no API keys**. Sandboxes are opt-in through environment variables, and every one of them is a free tier.

![USSD simulator](docs/screenshots/simulator.png)

![Order dashboard](docs/screenshots/dashboard.png)

The dashboard shot is a live local session. One payment is still waiting for approval. An older one was marked expired by the reconcile job after it sat unpaid.

## What you can show in five minutes

1. Open the simulator and press **Play this purchase**. It buys 2 Jazz Night tickets with MTN.
2. The session ends with `Check your phone to approve the payment. Ref: XXXXXXXX`.
3. Open the dashboard. The payment is `PENDING`. Press **Succeed**.
4. A ticket code, a QR image, and a console SMS appear. Press **Scan**. The pass opens above the orders. **Admit holder** marks it used once.

No handset, no wallet, and no credit card. You can also dial the keypad yourself. The phone posts the same form body Africa's Talking sends.

The Vercel deployment uses the same mock payments. Its dashboard header is `recruit-demo-admin`. A cold start creates a fresh SQLite file and seeds the four events.

## Where to read

| Question                        | Start here                                                     |
| ------------------------------- | -------------------------------------------------------------- |
| How does a menu step work?      | `apps/api/src/ussd/engine.ts` and `apps/api/src/ussd/screens/` |
| How is a ticket issued once?    | `settlePayment` in `apps/api/src/payments/service.ts`          |
| What does each wallet send?     | `apps/api/src/payments/providers/` and `docs/providers.md`     |
| Which numbers are accepted?     | `apps/api/src/lib/phone.ts`                                    |
| What does the test suite cover? | `apps/api/tests/`                                              |

## Architecture

```mermaid
flowchart LR
  subgraph clients
    Phone[Handset or simulator]
    Admin[Admin dashboard]
  end
  Phone -->|POST /ussd| API[Express API]
  Admin -->|orders, simulate, QR| API
  API --> Engine[USSD screens]
  API --> Pay[PaymentProvider]
  Engine --> DB[(SQLite)]
  Pay --> DB
  Pay --> Mock[Mock]
  Pay --> MTN[MTN MoMo sandbox]
  Pay --> Airtel[Airtel Money sandbox]
  Pay --> PayPal[PayPal sandbox]
  API --> SMS[SmsService]
  SMS --> Console[Console log]
  SMS --> AT[Africa's Talking sandbox]
  Job[node-cron reconcile] --> Pay
  Job --> DB
```

Menus are a screen-per-file state machine. Payments sit behind `initiatePayment`, `getStatus`, and `handleWebhook`. The default implementation is in-process and deterministic. A ticket row is inserted once, inside a database transaction.

```mermaid
stateDiagram-v2
  [*] --> Welcome
  Welcome --> Events: 1
  Welcome --> MyTickets: 2
  Welcome --> Help: 3
  Welcome --> [*]: 0
  Events --> Quantity: event number
  Events --> Events: 98 next page
  Events --> Welcome: 0
  Quantity --> Payment: 1 to 5
  Quantity --> Events: 0
  Payment --> Confirm: 1 MTN, 2 Airtel, 3 PayPal
  Payment --> Quantity: 0
  Confirm --> [*]: 1 pay or 2 cancel
  MyTickets --> Welcome: 0
  Help --> Welcome: 0
```

```mermaid
sequenceDiagram
  participant U as USSD session
  participant A as API
  participant D as SQLite
  participant P as Provider
  participant S as SMS
  U->>A: Confirm
  A->>D: Order + Payment PENDING (unique ref)
  A->>P: initiatePayment
  P-->>A: PENDING and provider ref
  A-->>U: END Check your phone. Ref XXXX
  P->>A: webhook or reconcile poll
  A->>D: set SUCCESSFUL only if still PENDING
  A->>D: insert Ticket once
  A->>S: send code
```

## Run it

Node.js 20 or newer. Docker is optional.

### Docker

```bash
docker compose up --build
```

- API and Swagger: http://localhost:3000/docs
- Simulator and dashboard: http://localhost:8080
- Health: http://localhost:3000/health

The compose file forces mock payments and console SMS. It does not read a `.env` file. The dashboard secret inside that container is `docker-demo-admin`.

### Without Docker

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run dev
```

On macOS or Linux, use `cp .env.example .env`.

- API: http://localhost:3000
- Web: http://localhost:5173
- Swagger: http://localhost:3000/docs

`npm run dev` starts the API and the Vite app together. The API applies the SQLite migration you just ran and seeds four events on startup if the table is empty. Leave `.env` as copied. Empty keys mean mock mode.

```bash
npm test
npm run lint
npm run build
```

## Environment variables

| Variable                   | Default                 | Purpose                                |
| -------------------------- | ----------------------- | -------------------------------------- |
| `PORT`                     | `3000`                  | API port                               |
| `DATABASE_URL`             | `file:./prisma/dev.db`  | SQLite file                            |
| `PUBLIC_BASE_URL`          | `http://localhost:3000` | Callback and PayPal return base        |
| `WEB_APP_URL`              | `http://localhost:5173` | Where PayPal sends the browser         |
| `USSD_SERVICE_CODE`        | `*384*123#`             | Shown in the simulator                 |
| `USSD_SESSION_TTL_SECONDS` | `120`                   | Idle timeout                           |
| `WEBHOOK_SECRET`           | `dev-webhook-secret`    | Callback authenticity                  |
| `ADMIN_SECRET`             | `demo-admin`            | `X-Admin-Secret` for the dashboard     |
| `MTN_MODE`                 | `mock`                  | `sandbox` calls MTN                    |
| `AIRTEL_MODE`              | `mock`                  | `sandbox` calls Airtel                 |
| `PAYPAL_MODE`              | `mock`                  | `sandbox` calls PayPal                 |
| `SMS_MODE`                 | `console`               | `sandbox` calls Africa's Talking       |
| `MOCK_PAYMENT_RESULT`      | `pending`               | `success` or `fail` settle immediately |
| `MOMO_CURRENCY`            | `EUR`                   | Sandbox collections are EUR            |
| `RECONCILE_AFTER_MINUTES`  | `2`                     | When polling of `PENDING` starts       |
| `PAYMENT_EXPIRE_MINUTES`   | `15`                    | Unapproved payments become `EXPIRED`   |

The full list, including where each key comes from, is in `.env.example`. `NODE_ENV=production` refuses to boot if `WEBHOOK_SECRET` or `ADMIN_SECRET` is still the sample value.

## Free services and how to get each key

You can skip this section for the demo. Nothing here asks for a card.

### Africa's Talking sandbox

1. Create a free account at <https://account.africastalking.com/>.
2. Stay on the sandbox app. The username is the literal word `sandbox`.
3. Open **Settings → API Key** and copy the sandbox key into `AT_API_KEY`.
4. Set `SMS_MODE=sandbox` and `AT_USERNAME=sandbox`.
5. For USSD, open the sandbox USSD page, create a channel (a short code such as `*384*123#` is assigned in the sandbox), and set the callback to `https://<your-tunnel>/ussd`.
6. Dial that code from their web simulator. SMS you send appears in the same simulator, not on a real phone.

### MTN MoMo developer sandbox

1. Create a free account at <https://momodeveloper.mtn.com/>.
2. Subscribe to the **Collections** product. Copy the Primary key into `MOMO_SUBSCRIPTION_KEY`.
3. Set `MOMO_CALLBACK_HOST` to a public hostname with no scheme, for example the host ngrok prints.
4. Run `npm run momo:setup`. It calls `POST /v1_0/apiuser` and `POST /v1_0/apiuser/{id}/apikey` and prints `MOMO_API_USER` and `MOMO_API_KEY`.
5. Set `MTN_MODE=sandbox`. Leave `MOMO_CURRENCY=EUR`.
6. Pay from a test MSISDN listed at <https://momodeveloper.mtn.com/api-documentation/testing>. Other numbers often return `SUCCESSFUL` immediately, which is a sandbox shortcut, not a completed PIN prompt.

### PayPal sandbox

1. Create a free developer account at <https://developer.paypal.com/dashboard/>.
2. **Apps & Credentials → Sandbox → Create App**. Copy the Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
3. Under **Sandbox → Accounts**, use the pre-made Personal account (fake buyer). No real card is charged.
4. Set `PAYPAL_MODE=sandbox`. The USSD session still ends with the short reference. The approval URL is on the dashboard and in the SMS log.
5. Optional: add a webhook to `https://<your-tunnel>/webhooks/paypal` for `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`, then set `PAYPAL_WEBHOOK_ID`. Without that id the route also accepts `X-Callback-Token`.

### Airtel Money open API

1. Create a developer account at <https://developers.airtel.africa/>.
2. Create an app and copy the client id and secret into `AIRTEL_CLIENT_ID` and `AIRTEL_CLIENT_SECRET`.
3. Set `AIRTEL_COUNTRY` and `AIRTEL_CURRENCY` to a market that app actually has. The defaults are `UG` and `UGX` because Rwanda is not enabled on every sandbox app.
4. Set `AIRTEL_MODE=sandbox`. The menu still shows RWF. The charge sent to Airtel uses `AIRTEL_CURRENCY` and `AIRTEL_RWF_PER_UNIT` (an illustrative rate, not a live FX feed).

### A public URL for callbacks

Sandbox gateways cannot reach `localhost`.

- ngrok: sign up free at <https://ngrok.com/>, install the CLI, run `ngrok http 3000`, and set `PUBLIC_BASE_URL` to the `https` URL it prints.
- Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:3000` on the free `cloudflared` binary. Same idea, no account card.

Point the Africa's Talking callback at `{PUBLIC_BASE_URL}/ussd`. MTN's callback host is only the hostname.

## How to test

### a. Built-in simulator

Start the app and open the web UI. The phone posts form fields `sessionId`, `serviceCode`, `phoneNumber`, and `text`, which is what Africa's Talking sends. `text` grows (`1`, then `1*2`, then `1*2*1`). Use `+250788123456` for MTN or `+250728123456` for Airtel.

The same path from curl:

```bash
curl -s -X POST http://localhost:3000/ussd \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=demo-1&serviceCode=*384*123#&phoneNumber=%2B250788123456&text="

curl -s -X POST http://localhost:3000/ussd \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=demo-1&serviceCode=*384*123#&phoneNumber=%2B250788123456&text=1*1*2*1*1"
```

The second call ends the session and prints `Ref:`. Then:

```bash
curl -s -X POST http://localhost:3000/webhooks/mock \
  -H "Content-Type: application/json" \
  -H "X-Callback-Token: dev-webhook-secret" \
  -d "{\"reference\":\"PASTE_REF\",\"status\":\"SUCCESSFUL\"}"
```

Or use the dashboard button, which calls `POST /api/payments/{reference}/simulate` with `X-Admin-Secret: demo-admin`. Sending the webhook twice does not create a second ticket.

### b. Africa's Talking simulator and ngrok

1. `npm run dev` and `ngrok http 3000`.
2. Set `PUBLIC_BASE_URL` to the ngrok URL and restart the API.
3. In the Africa's Talking sandbox, set the USSD callback to `https://<ngrok-host>/ussd`.
4. Dial the sandbox short code in their simulator.
5. With `SMS_MODE=sandbox`, the ticket SMS shows in their SMS simulator after you mark the payment successful (or after a real sandbox payment completes).

### c. MTN MoMo sandbox

After the signup steps above:

```bash
curl -s -X POST https://sandbox.momodeveloper.mtn.com/collection/token/ \
  -H "Authorization: Basic BASE64_APIUSER_APIKEY" \
  -H "Ocp-Apim-Subscription-Key: $MOMO_SUBSCRIPTION_KEY" \
  -D -
```

A buy through USSD with provider `1` then calls `POST /collection/v1_0/requesttopay`. Status comes back on `GET /collection/v1_0/requesttopay/{referenceId}` or on `POST /webhooks/mtn?token=$WEBHOOK_SECRET`. The reconcile job polls `PENDING` payments older than `RECONCILE_AFTER_MINUTES`.

Request and response shapes are written up in [docs/providers.md](docs/providers.md), including the places the public docs are thin.

## Sandbox limits

- MTN Collections sandbox charges **EUR**, not RWF, and only behaves predictably for the published test numbers.
- Africa's Talking sandbox SMS is visible in their web simulator. It is not delivered to a Rwandan handset. A live sender ID needs their approval.
- PayPal sandbox uses fake buyer and merchant accounts. Captures do not move real money.
- Airtel sandbox country and currency follow the app you created. This demo does not assume Rwanda is enabled.
- ngrok's free tier rotates the URL when the process restarts. Update `PUBLIC_BASE_URL` and the gateway callback when it changes.
- Menus are capped at 182 characters, which is the usual USSD screen size. Event names on the menu are shortened to stay inside it.

## Design decisions

- **Mock first.** Missing keys must not be a reason the demo fails. `MTN_MODE`, `AIRTEL_MODE`, and `PAYPAL_MODE` default to `mock`. `SMS_MODE` defaults to `console`, which still writes the `SmsLog` table the dashboard reads.
- **One screen per module.** Adding a menu is a new file plus a line in the screen map, not another branch in a single function. Invalid input re-prompts. The engine diffs Africa's Talking's cumulative `text` so a bad keystroke is consumed once.
- **RWF on the screen, sandbox currency on the wire.** Orders store `totalRwf`. A sandbox charge is converted with `MOMO_RWF_PER_UNIT` or `PAYPAL_RWF_PER_UNIT`. Those rates are labeled as illustrative. They are not a treasury feed.
- **SQLite, Postgres-shaped.** Statuses and JSON payloads are strings. There are no SQLite-only column types, so the same Prisma models can move to PostgreSQL by changing the datasource and generating a new migration.
- **Idempotent tickets.** `Payment.externalRef` and `Ticket.orderId` are unique. A status change from `PENDING` uses `updateMany` with `status: PENDING`, so two webhook deliveries cannot both win. A `WebhookReceipt` row ignores an identical delivery id.
- **Suggest the wallet, do not block it.** `078/079` suggests MTN and `072/073` suggests Airtel. The payer can still pick the other method or PayPal. A mismatch is printed on the confirm screen.
- **In-process cron.** `node-cron` polls stale `PENDING` payments and sends a ticket SMS if the process died between the insert and the send. There is no Redis and no hosted queue.

## Security

- Helmet, CORS allow-list, rate limiting, and `X-Request-Id` on every response.
- Phone numbers in logs and in `/api/orders` are masked (`+25078***3456`). Tokens, API keys, and the webhook secret are redacted from logs.
- Webhooks check a shared secret with a constant-time compare. PayPal additionally calls the verify-webhook-signature API when `PAYPAL_WEBHOOK_ID` is set. MTN's public docs do not describe an HMAC, so the secret travels on the callback URL we register.
- The admin header is a demo lock for a local UI. It is not user authentication. Production refuses the sample secret values.
- Card data never touches this service. PayPal hosts that page. The QR encodes `/t/{code}` and the PNG is generated locally. Scanning it, or pressing Scan on the dashboard, opens the pass. Admit marks that code used once.

## What I would do next for production

- Move jobs to a durable queue with backoff, a dead-letter path, and more than one API instance. SQLite and in-process cron are demo constraints.
- Run PostgreSQL, add OpenTelemetry, and alert on payments stuck in `PENDING`.
- Keep card handling inside PayPal so this system stays out of PCI cardholder scope. Mobile-money PIN entry stays on the handset.
- Register a real short code with a Rwandan aggregator, sign the telco agreements, and complete KYC with MTN and Airtel before any live wallet is debited. Sandbox EUR and test MSISDNs do not transfer to production RWF.
- Register an SMS sender ID, store consent, and rate-limit outbound SMS per MSISDN.
- Replace the admin header with real operator login, and verify Airtel's country-specific callback hash instead of a header the gateway does not send.

## Layout

```
apps/api     Express, Prisma, USSD, payments, SMS, jobs
apps/web     React simulator and dashboard
docs         Provider endpoint notes and screenshots
```

Swagger lives at `/docs`. Tests cover phone parsing, the menu state machine, the full `/ussd` purchase, webhook idempotency, reconciliation expiry, and the HTTP shape of each sandbox adapter with a fake `fetch`. GitHub Actions runs lint, those tests, and the production build on every push.
