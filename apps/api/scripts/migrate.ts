import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiRoot, "../..");

dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./prisma/dev.db";
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: apiRoot,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
