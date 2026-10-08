import { AppError } from "../../lib/errors.js";
import type { ScreenStep } from "../types.js";

export function endWalletError(error: unknown): ScreenStep {
  if (error instanceof AppError && error.statusCode < 500) {
    return { type: "end", message: error.message };
  }
  throw error;
}
