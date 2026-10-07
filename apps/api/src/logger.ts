import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.apikey",
      "req.headers.cookie",
      "req.headers['x-callback-token']",
      "req.headers['x-admin-secret']",
      "apiKey",
      "access_token",
      "client_secret",
      "subscriptionKey",
      "password",
    ],
    remove: true,
  },
});
