import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateOdooCSV, OdooLineInput } from "@/lib/payroll/odoo-export";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { periodId } = await params;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
  });

  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }

  if (!["CALCULADO", "CERRADO"].includes(period.status)) {
    return NextResponse.json(
      { error: "El periodo debe estar CALCULADO o CERRADO para exportar" },
      { status: 400 }
    );
  }

  const details = await prisma.payrollDetail.findMany({
    where: { periodId, isExcluded: false },
    include: {
      employee: { select: { costCenter: true } },
      lines: {
        select: { conceptCode: true, amount: true },
      },
    },
  });

  if (details.length === 0) {
    return NextResponse.json({ error: "No hay empleados calculados en este periodo" }, { status: 400 });
  }

  const odooLines: OdooLineInput[] = details.flatMap((d) =>
    d.lines.map((l) => ({
      conceptCode: l.conceptCode,
      amount: l.amount,
      costCenter: d.employee.costCenter,
    }))
  );

  const netoMap = new Map<string, number>();
  for (const d of details) {
    const cc = d.employee.costCenter;
    netoMap.set(cc, (netoMap.get(cc) ?? 0) + d.netoAPagar);
  }
  const netoByCC = Array.from(netoMap.entries()).map(([costCenter, totalNeto]) => ({
    costCenter,
    totalNeto,
  }));

  const periodLabel = `${period.periodYear}-${String(period.periodMonth).padStart(2, "0")}`;
  const periodEndDate = period.endDate.toISOString();

  const csvContent = generateOdooCSV({
    periodLabel,
    periodEndDate,
    lines: odooLines,
    netoByCC,
  });

  const fileName = `Odoo_NOM_${periodLabel}.csv`;

  console.log(
    `[PLANILLA] ODOO_EXPORT: periodo=${periodLabel}, empleados=${details.length}, por=${session.email}`
  );

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
