import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPeriodDates } from "@/lib/payroll/date-utils";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (year) where.periodYear = parseInt(year);
  if (status) where.status = status;

  const periods = await prisma.payrollPeriod.findMany({
    where,
    include: {
      details: {
        select: {
          id: true,
          netoAPagar: true,
        },
      },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });

  const result = periods.map((p) => ({
    ...p,
    employeeCount: p.details.length,
    totalNeto: p.details.reduce((s, d) => s + d.netoAPagar, 0),
    details: undefined,
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { periodYear, periodMonth, periodType = "MENSUAL", paymentDate, notes } = body;

  if (!periodYear || !periodMonth) {
    return NextResponse.json({ error: "Año y mes son requeridos" }, { status: 400 });
  }

  const existing = await prisma.payrollPeriod.findUnique({
    where: {
      periodYear_periodMonth_periodType: {
        periodYear: parseInt(periodYear),
        periodMonth: parseInt(periodMonth),
        periodType,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ error: "Ya existe un periodo para este mes/año/tipo" }, { status: 409 });
  }

  const { start, end } = getPeriodDates(parseInt(periodYear), parseInt(periodMonth));

  const period = await prisma.payrollPeriod.create({
    data: {
      periodYear: parseInt(periodYear),
      periodMonth: parseInt(periodMonth),
      periodType,
      startDate: start,
      endDate: end,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      notes: notes || null,
    },
  });

  console.log(`[PLANILLA] PERIODO CREADO: ${periodYear}-${String(periodMonth).padStart(2, "0")} (${periodType})`);
  return NextResponse.json(period, { status: 201 });
}
