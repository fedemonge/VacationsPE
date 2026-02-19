import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const costCenter = searchParams.get("costCenter");

  if (type === "aprobaciones") {
    return getApprovalTimeReport(costCenter);
  }

  if (type === "aging") {
    return getAgingReport(costCenter);
  }

  return NextResponse.json({ error: "Tipo de reporte no válido" }, { status: 400 });
}

async function getApprovalTimeReport(costCenter: string | null) {
  const whereClause: Record<string, unknown> = {
    status: { in: ["APROBADO", "RECHAZADO"] },
    decidedAt: { not: null },
  };

  if (costCenter) {
    const employeeIds = await prisma.employee.findMany({
      where: { costCenter },
      select: { id: true },
    });
    const ids = employeeIds.map((e) => e.id);
    const requests = await prisma.vacationRequest.findMany({
      where: { employeeId: { in: ids } },
      select: { id: true },
    });
    whereClause.requestId = { in: requests.map((r) => r.id) };
  }

  const approvals = await prisma.approvalRecord.findMany({
    where: whereClause,
  });

  // Group by approver
  const byApprover: Record<
    string,
    { name: string; email: string; level: number; totalDays: number; count: number }
  > = {};

  for (const a of approvals) {
    const key = a.approverEmail;
    if (!byApprover[key]) {
      byApprover[key] = {
        name: a.approverName,
        email: a.approverEmail,
        level: a.level,
        totalDays: 0,
        count: 0,
      };
    }
    if (a.decidedAt) {
      const days =
        (a.decidedAt.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      byApprover[key].totalDays += days;
      byApprover[key].count++;
    }
  }

  const report = Object.values(byApprover).map((a) => ({
    approverName: a.name,
    approverEmail: a.email,
    level: a.level,
    totalApprovals: a.count,
    avgDays: a.count > 0 ? a.totalDays / a.count : 0,
  }));

  return NextResponse.json({ report });
}

async function getAgingReport(costCenter: string | null) {
  const employeeWhere: Record<string, unknown> = { terminationDate: null };
  if (costCenter) employeeWhere.costCenter = costCenter;

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);

  const accruals = await prisma.vacationAccrual.findMany({
    where: { employeeId: { in: employeeIds } },
  });

  // Group by year
  const byYear: Record<
    number,
    { employees: Set<string>; accrued: number; consumed: number; remaining: number }
  > = {};

  for (const a of accruals) {
    if (!byYear[a.accrualYear]) {
      byYear[a.accrualYear] = {
        employees: new Set(),
        accrued: 0,
        consumed: 0,
        remaining: 0,
      };
    }
    byYear[a.accrualYear].employees.add(a.employeeId);
    byYear[a.accrualYear].accrued += a.totalDaysAccrued;
    byYear[a.accrualYear].consumed += a.totalDaysConsumed;
    byYear[a.accrualYear].remaining += a.remainingBalance;
  }

  const report = Object.entries(byYear)
    .map(([year, data]) => ({
      accrualYear: parseInt(year),
      totalEmployees: data.employees.size,
      totalAccrued: data.accrued,
      totalConsumed: data.consumed,
      totalRemaining: data.remaining,
    }))
    .sort((a, b) => a.accrualYear - b.accrualYear);

  return NextResponse.json({ report });
}
