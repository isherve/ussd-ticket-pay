import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findApiRoot(): string {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Prisma schema was not included in this deployment.");
}

function databaseFile(): string {
  const url = process.env.DATABASE_URL ?? "file:/tmp/ussd.db";
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

export function prepareDatabase(): void {
  if (process.env.VERCEL !== "1") return;
  const file = databaseFile();
  if (existsSync(file)) return;

  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: findApiRoot(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(result.error?.message ?? "prisma migrate deploy failed");
  }
}
