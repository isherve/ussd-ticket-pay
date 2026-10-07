import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ConfigError, loadConfig } from "../src/config.js";

const app = createApp();

describe("health", () => {
  it("returns ok when sqlite answers", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", db: "up" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(app)
      .post("/webhooks/mock")
      .set("Content-Type", "application/json")
      .set("X-Callback-Token", "test-webhook-secret")
      .send("{");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("bad_request");
  });

  it("serves the OpenAPI document", async () => {
    const response = await request(app).get("/docs/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.paths["/health"]).toBeTruthy();
  });
});

describe("config", () => {
  it("rejects MTN sandbox mode without free sandbox credentials", () => {
    expect(() =>
      loadConfig({
        ...process.env,
        MTN_MODE: "sandbox",
        MOMO_SUBSCRIPTION_KEY: "",
        MOMO_API_USER: "",
        MOMO_API_KEY: "",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects the demo webhook secret in production", () => {
    expect(() =>
      loadConfig({
        ...process.env,
        NODE_ENV: "production",
        WEBHOOK_SECRET: "dev-webhook-secret",
      }),
    ).toThrow(/WEBHOOK_SECRET/);
  });
});
