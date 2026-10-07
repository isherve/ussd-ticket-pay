export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "USSD Ticket Pay",
    version: "1.0.0",
    description:
      "Demo USSD ticketing API. Defaults to in-process mocks and SQLite. Set env vars to call Africa's Talking, MTN MoMo, Airtel Money, or PayPal sandboxes.",
  },
  components: {
    securitySchemes: {
      adminSecret: { type: "apiKey", in: "header", name: "X-Admin-Secret" },
      callbackToken: { type: "apiKey", in: "header", name: "X-Callback-Token" },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Liveness and database check",
        responses: {
          "200": { description: "Database answered" },
          "503": { description: "Database down" },
        },
      },
    },
    "/ussd": {
      post: {
        summary: "Africa's Talking USSD callback",
        description:
          "Form body: sessionId, serviceCode, phoneNumber, text. text is the *-separated input history. Response is text/plain starting with CON or END.",
        responses: { "200": { description: "CON or END menu" } },
      },
    },
    "/webhooks/mock": {
      post: {
        summary: "Simulate a payment result. Mock mode only.",
        security: [{ callbackToken: [] }],
        responses: {
          "200": { description: "Applied or duplicate" },
          "401": { description: "Bad token" },
        },
      },
    },
    "/webhooks/mtn": {
      post: {
        summary: "MTN MoMo collection callback. Authenticity is the token query parameter.",
        responses: { "200": { description: "Accepted" } },
      },
    },
    "/webhooks/airtel": {
      post: {
        summary: "Airtel Money callback. Requires X-Callback-Token.",
        security: [{ callbackToken: [] }],
        responses: { "200": { description: "Accepted" } },
      },
    },
    "/webhooks/paypal": {
      post: {
        summary: "PayPal webhook. Verified with PayPal when PAYPAL_WEBHOOK_ID is set.",
        responses: { "200": { description: "Accepted" } },
      },
    },
    "/api/orders": {
      get: {
        summary: "Recent orders with masked phone numbers",
        security: [{ adminSecret: [] }],
        responses: { "200": { description: "Order list" } },
      },
    },
    "/api/sms": {
      get: {
        summary: "SMS log",
        security: [{ adminSecret: [] }],
        responses: { "200": { description: "Messages" } },
      },
    },
    "/api/payments/{reference}/simulate": {
      post: {
        summary: "Mark a mock payment successful or failed",
        security: [{ adminSecret: [] }],
        parameters: [{ name: "reference", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Applied" },
          "403": { description: "Provider is not in mock mode" },
        },
      },
    },
    "/api/tickets/{code}": {
      get: {
        summary: "Public ticket pass for a scanned code",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Ticket pass" },
          "404": { description: "Unknown code" },
        },
      },
    },
    "/api/tickets/{code}/admit": {
      post: {
        summary: "Admit a ticket once. A second call stays admitted.",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Admitted pass" },
          "404": { description: "Unknown code" },
        },
      },
    },
    "/api/tickets/{code}/qr": {
      get: {
        summary: "PNG QR code for an issued ticket",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "image/png" } },
      },
    },
  },
};
