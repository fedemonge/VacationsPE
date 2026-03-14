import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calculateAll } from "@/lib/payroll/calculator";
import { isGratificationMonth, isCtsMonth } from "@/lib/payroll/date-utils";
import { DEFAULT_UIT, DEFAULT_RMV } from "@/lib/payroll/peru-tax";
import type { EmployeePayrollContext, PayrollInputForm } from "@/lib/payroll/types";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body: PayrollInputForm = await request.json();

  if (!body.employeeId || !body.baseSalary || !body.periodYear || !body.periodMonth) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const ctx: EmployeePayrollContext = {
    employeeId: body.employeeId,
    employeeCode: "",
    fullName: "",
    baseSalary: body.baseSalary,
    dailyHours: body.dailyHours || 8,
    pensionSystem: body.pensionSystem || "AFP",
    pensionProvider: body.pensionProvider || "PRIMA",
    has5taCatExemption: body.has5taCatExemption || false,
    hasDependents: body.hasDependents || false,
    periodYear: body.periodYear,
    periodMonth: body.periodMonth,
    daysWorked: body.daysWorked ?? 30,
    overtimeHours25: body.overtimeHours25 || 0,
    overtimeHours35: body.overtimeHours35 || 0,
    overtimeHours100: body.overtimeHours100 || 0,
    totalCommissions: body.totalCommissions || 0,
    totalTardinessMinutes: body.totalTardinessMinutes || 0,
    daysAbsent: body.daysAbsent || 0,
    uitValue: DEFAULT_UIT[body.periodYear] || 5550,
    rmvValue: DEFAULT_RMV,
    afpFondoRate: null,
    afpSeguroRate: null,
    afpComisionRate: null,
    annualGrossPreviousMonths: body.annualGrossPreviousMonths || 0,
    taxRetainedPreviousMonths: body.taxRetainedPreviousMonths || 0,
    monthsWorkedInSemester: body.monthsWorkedInSemester ?? 6,
    isGratificationMonth: isGratificationMonth(body.periodMonth),
    isCtsMonth: isCtsMonth(body.periodMonth),
  };

  const result = calculateAll(ctx);

  console.log(`[PLANILLA] CALCULO PREVIEW: empleado=${body.employeeId}, periodo=${body.periodYear}-${String(body.periodMonth).padStart(2, "0")}, neto=${result.netoAPagar}`);
  return NextResponse.json(result);
}
