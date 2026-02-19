import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const costCenter = searchParams.get("costCenter");

  const employeeWhere: Record<string, unknown> = { terminationDate: null };
  if (costCenter) employeeWhere.costCenter = costCenter;
  if (employeeId) employeeWhere.id = employeeId;

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: {
      vacationAccruals: { orderBy: { accrualYear: "asc" } },
    },
    orderBy: { fullName: "asc" },
  });

  const balances = employees.map((emp) => ({
    id: emp.id,
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    costCenter: emp.costCenter,
    accruals: emp.vacationAccruals.map((a) => ({
      accrualYear: a.accrualYear,
      totalDaysAccrued: a.totalDaysAccrued,
      totalDaysConsumed: a.totalDaysConsumed,
      remainingBalance: a.remainingBalance,
      monthsAccrued: a.monthsAccrued,
    })),
    totalAvailable: emp.vacationAccruals.reduce(
      (sum, a) => sum + a.remainingBalance,
      0
    ),
  }));

  return NextResponse.json({ balances });
}
