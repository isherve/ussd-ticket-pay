import { rmSync } from "node:fs";
import { execSync } from "node:child_process";

export default function setup(): void {
  rmSync("prisma/test.db", { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
  });
}
