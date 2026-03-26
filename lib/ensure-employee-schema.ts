import { prisma } from "@/lib/prisma";

let columnsChecked = false;

/**
 * Ensure the Employee table has all columns that were added after the initial
 * schema (specifically columns added with the FEC module).
 * Uses ALTER TABLE ADD COLUMN — safe to call repeatedly (checked once per server lifecycle).
 */
export async function ensureEmployeeColumns() {
  if (columnsChecked) return;

  try {
    // Check which columns already exist
    const info = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info("Employee")`
    );
    const existing = new Set(info.map((r) => r.name));

    // payrollCompanyId — added with FEC module
    if (!existing.has("payrollCompanyId")) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Employee" ADD COLUMN "payrollCompanyId" TEXT`
      );
      console.log("[EMPLOYEE] Added column: payrollCompanyId");
    }

    columnsChecked = true;
  } catch (err) {
    console.error("[EMPLOYEE] ensureEmployeeColumns failed:", err);
    // Don't throw — let the route handle any remaining errors
  }
}
