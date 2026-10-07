import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../logger.js";

function clientStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("status" in err)) return null;
  const status = err.status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const status = clientStatus(err);
  if (status !== null && err instanceof Error) {
    res.status(status).json({ error: "bad_request", message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      issues: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  logger.error(
    {
      err,
      requestId: req.id,
      path: req.path,
    },
    "unhandled error",
  );

  res.status(500).json({
    error: "internal_error",
    message: config.nodeEnv === "production" ? "Internal server error" : "Internal server error",
    requestId: req.id,
  });
}
