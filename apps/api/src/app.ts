import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { errorHandler } from "./http/middleware/errorHandler.js";
import { requestId } from "./http/middleware/requestId.js";
import { adminRouter } from "./http/routes/admin.js";
import { healthRouter } from "./http/routes/health.js";
import { ussdRouter } from "./http/routes/ussd.js";
import { webhookRouter } from "./http/routes/webhooks.js";
import { logger } from "./logger.js";
import { openApiSpec } from "./openapi.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customProps: (req) => ({ requestId: (req as express.Request).id }),
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (process.env.VERCEL === "1" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      allowedHeaders: ["Content-Type", "X-Request-Id", "X-Admin-Secret", "X-Callback-Token"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buffer) => {
        (req as express.Request).rawBody = buffer;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.nodeEnv === "test" ? 10_000 : config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
    }),
  );

  app.get("/docs/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use(healthRouter);
  app.use(ussdRouter);
  app.use(webhookRouter);
  app.use(adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorHandler);
  return app;
}
