import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/empleados/next-code
 * Returns the next available employee code in "000" format.
 * Scans all existing codes, extracts numeric portions, and returns max + 1.
 */
export async function GET() {
  const employees = await prisma.employee.findMany({
    select: { employeeCode: true },
  });

  let maxNum = 0;
  for (const emp of employees) {
    // Extract numeric portion from codes like "014", "EMP-005", "E001", etc.
    const match = emp.employeeCode.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextCode = String(maxNum + 1).padStart(3, "0");
  return NextResponse.json({ nextCode });
}
