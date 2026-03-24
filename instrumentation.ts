import { execSync } from "child_process";

export async function register() {
  // Ensure database schema is up to date on server startup.
  // This handles cases where new Prisma models were added but
  // the production SQLite DB hasn't been migrated yet.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      console.log("[INSTRUMENTATION] Running prisma db push...");
      execSync("npx prisma db push --skip-generate", {
        stdio: "pipe",
        timeout: 30000,
      });
      console.log("[INSTRUMENTATION] Database schema is up to date.");
    } catch (err) {
      console.error("[INSTRUMENTATION] prisma db push failed:", err);
    }
  }
}
