import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const periodYear = searchParams.get("periodYear");
  const periodMonth = searchParams.get("periodMonth");

  const where: Record<string, unknown> = {};
  if (periodId) {
    where.periodId = periodId;
  } else if (periodYear) {
    // Find period IDs matching year/month
    const periodWhere: Record<string, unknown> = { periodYear: parseInt(periodYear) };
    if (periodMonth) periodWhere.periodMonth = parseInt(periodMonth);
    const periods = await prisma.payrollPeriod.findMany({
      where: periodWhere,
      select: { id: true },
    });
    where.periodId = { in: periods.map((p) => p.id) };
  }

  const logs = await prisma.payrollAdjustmentLog.findMany({
    where,
    orderBy: { adjustedAt: "desc" },
  });

  // Enrich with period info
  const periodIds = Array.from(new Set(logs.map((l) => l.periodId)));
  const periods = await prisma.payrollPeriod.findMany({
    where: { id: { in: periodIds } },
    select: { id: true, periodYear: true, periodMonth: true },
  });
  const periodMap = new Map(periods.map((p) => [p.id, p]));

  const result = logs.map((log) => {
    const period = periodMap.get(log.periodId);
    return {
      ...log,
      periodLabel: period
        ? `${period.periodYear}-${String(period.periodMonth).padStart(2, "0")}`
        : "",
      difference: Math.round((log.adjustedAmount - log.autoAmount) * 100) / 100,
    };
  });

  return NextResponse.json(result);
}
