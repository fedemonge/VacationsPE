import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateAll } from "@/lib/payroll/calculator";
import { isGratificationMonth, isCtsMonth } from "@/lib/payroll/date-utils";
import { DEFAULT_UIT, DEFAULT_RMV } from "@/lib/payroll/peru-tax";
import type { EmployeePayrollContext, PayrollInputForm, PayrollAdjustment } from "@/lib/payroll/types";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const input: PayrollInputForm = body;
  const periodId: string = body.periodId;
  const adjustments: PayrollAdjustment[] = body.adjustments || [];

  if (!periodId) {
    return NextResponse.json({ error: "periodId es requerido" }, { status: 400 });
  }

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }
  if (period.status === "CERRADO") {
    return NextResponse.json({ error: "No se puede modificar un periodo cerrado" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  // Build context and calculate
  const ctx: EmployeePayrollContext = {
    employeeId: input.employeeId,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    baseSalary: input.baseSalary,
    dailyHours: input.dailyHours || 8,
    pensionSystem: input.pensionSystem || "AFP",
    pensionProvider: input.pensionProvider || "PRIMA",
    has5taCatExemption: input.has5taCatExemption || false,
    hasDependents: input.hasDependents || false,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    daysWorked: input.daysWorked ?? 30,
    overtimeHours25: input.overtimeHours25 || 0,
    overtimeHours35: input.overtimeHours35 || 0,
    overtimeHours100: input.overtimeHours100 || 0,
    totalCommissions: input.totalCommissions || 0,
    totalTardinessMinutes: input.totalTardinessMinutes || 0,
    daysAbsent: input.daysAbsent || 0,
    uitValue: DEFAULT_UIT[input.periodYear] || 5550,
    rmvValue: DEFAULT_RMV,
    afpFondoRate: null,
    afpSeguroRate: null,
    afpComisionRate: null,
    annualGrossPreviousMonths: input.annualGrossPreviousMonths || 0,
    taxRetainedPreviousMonths: input.taxRetainedPreviousMonths || 0,
    monthsWorkedInSemester: input.monthsWorkedInSemester ?? 6,
    isGratificationMonth: isGratificationMonth(input.periodMonth),
    isCtsMonth: isCtsMonth(input.periodMonth),
  };

  const result = calculateAll(ctx);

  // Build adjustment map
  const adjMap = new Map<string, PayrollAdjustment>();
  for (const adj of adjustments) {
    adjMap.set(adj.conceptCode, adj);
  }

  // Apply adjustments to totals
  let totalIngresos = 0;
  let totalDescuentos = 0;
  let totalAportesEmpleador = 0;

  const linesData = result.lines.map((line, idx) => {
    const adj = adjMap.get(line.conceptCode);
    const finalAmount = adj ? adj.newAmount : line.amount;

    if (line.category === "INGRESO") totalIngresos += finalAmount;
    else if (line.category === "DESCUENTO") totalDescuentos += finalAmount;
    else if (line.category === "APORTE_EMPLEADOR") totalAportesEmpleador += finalAmount;

    return {
      conceptCode: line.conceptCode,
      conceptName: line.conceptName,
      category: line.category,
      calcBase: line.calcBase,
      calcRate: line.calcRate,
      calcFormula: line.calcFormula,
      amount: finalAmount,
      autoAmount: adj ? line.amount : null,
      isAdjusted: !!adj,
      adjustedBy: adj ? session.email : null,
      adjustedAt: adj ? new Date() : null,
      adjustmentReason: adj ? adj.reason : null,
      displayOrder: idx,
    };
  });

  const netoAPagar = Math.round((totalIngresos - totalDescuentos) * 100) / 100;

  // Delete existing detail for this employee in this period if recalculating
  const existingDetail = await prisma.payrollDetail.findUnique({
    where: { periodId_employeeId: { periodId, employeeId: input.employeeId } },
  });
  if (existingDetail) {
    await prisma.payrollDetailLine.deleteMany({ where: { detailId: existingDetail.id } });
    await prisma.payrollDetail.delete({ where: { id: existingDetail.id } });
  }

  // Create detail + lines
  const detail = await prisma.payrollDetail.create({
    data: {
      periodId,
      employeeId: input.employeeId,
      baseSalary: input.baseSalary,
      daysWorked: input.daysWorked ?? 30,
      pensionSystem: input.pensionSystem || "AFP",
      pensionProvider: input.pensionProvider || "PRIMA",
      hasDependents: input.hasDependents || false,
      totalIngresos: Math.round(totalIngresos * 100) / 100,
      totalDescuentos: Math.round(totalDescuentos * 100) / 100,
      totalAportesEmpleador: Math.round(totalAportesEmpleador * 100) / 100,
      netoAPagar,
      inputSnapshot: JSON.stringify(ctx),
      lines: {
        create: linesData,
      },
    },
    include: { lines: true },
  });

  // Create adjustment logs
  for (const lineData of linesData) {
    if (lineData.isAdjusted && lineData.autoAmount !== null) {
      await prisma.payrollAdjustmentLog.create({
        data: {
          detailLineId: detail.lines.find((l) => l.conceptCode === lineData.conceptCode)?.id || "",
          periodId,
          employeeId: input.employeeId,
          employeeName: employee.fullName,
          employeeCode: employee.employeeCode,
          conceptCode: lineData.conceptCode,
          conceptName: lineData.conceptName,
          autoAmount: lineData.autoAmount,
          adjustedAmount: lineData.amount,
          adjustedBy: session.email,
          reason: lineData.adjustmentReason,
        },
      });
    }
  }

  // Update period status
  if (period.status === "ABIERTO") {
    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "CALCULADO", calculatedAt: new Date(), calculatedBy: session.email },
    });
  }

  console.log(`[PLANILLA] CALCULO GUARDADO: ${employee.employeeCode} ${employee.fullName}, periodo=${period.periodYear}-${String(period.periodMonth).padStart(2, "0")}, neto=${netoAPagar}, ajustes=${adjustments.length}`);
  return NextResponse.json(detail, { status: 201 });
}
