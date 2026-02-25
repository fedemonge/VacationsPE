import { prisma } from "@/lib/prisma";
import type {
  SupervisorReport,
  EmployeeMonthlyReport,
  VacationMovement,
  CashOutMovement,
  AdjustmentMovement,
  AccrualMovement,
} from "@/types";

const MONTHLY_RATE = 2.5;
const MAX_DAYS_PER_YEAR = 30;

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function getDefaultReportMonth(): { year: number; month: number } {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  if (month === 0) {
    return { year: now.getFullYear() - 1, month: 12 };
  }
  return { year: now.getFullYear(), month };
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function calculateAccrualIncrementForMonth(
  accrualStartDate: Date,
  accrualEndDate: Date,
  targetYear: number,
  targetMonth: number
): number {
  const monthStart = new Date(targetYear, targetMonth - 1, 1);
  const monthEnd = lastDayOfMonth(targetYear, targetMonth);

  // If the period had not started by month end, no increment
  if (accrualStartDate > monthEnd) return 0;
  // If the period ended before month start, no increment (already fully accrued)
  if (accrualEndDate <= monthStart) return 0;

  // Months accrued at end of target month
  const monthsAtEnd = Math.min(
    12,
    (monthEnd.getFullYear() - accrualStartDate.getFullYear()) * 12 +
      monthEnd.getMonth() - accrualStartDate.getMonth()
  );

  // Months accrued at start of target month
  const monthsAtStart = Math.min(
    12,
    Math.max(
      0,
      (monthStart.getFullYear() - accrualStartDate.getFullYear()) * 12 +
        monthStart.getMonth() - accrualStartDate.getMonth()
    )
  );

  const accruedAtEnd = Math.min(MAX_DAYS_PER_YEAR, monthsAtEnd * MONTHLY_RATE);
  const accruedAtStart = Math.min(MAX_DAYS_PER_YEAR, monthsAtStart * MONTHLY_RATE);

  return Math.max(0, accruedAtEnd - accruedAtStart);
}

export async function generateMonthlyReport(
  targetYear: number,
  targetMonth: number
): Promise<SupervisorReport[]> {
  const monthStart = new Date(targetYear, targetMonth - 1, 1);
  const monthEnd = lastDayOfMonth(targetYear, targetMonth);

  // 1. Get all active employees with accruals
  const employees = await prisma.employee.findMany({
    where: { terminationDate: null },
    include: {
      vacationAccruals: { orderBy: { accrualYear: "asc" } },
    },
    orderBy: { fullName: "asc" },
  });

  // 2. Get all consumptions created in the target month
  const consumptions = await prisma.vacationConsumption.findMany({
    where: {
      consumedAt: { gte: monthStart, lte: monthEnd },
    },
    include: {
      accrual: { select: { accrualYear: true, employeeId: true } },
      vacationRequest: {
        select: { id: true, dateFrom: true, dateTo: true, totalDays: true },
      },
      cashOutRequest: {
        select: { id: true, daysRequested: true },
      },
    },
  });

  // 3. Get all balance adjustments in the target month
  const adjustments = await prisma.balanceAdjustment.findMany({
    where: {
      createdAt: { gte: monthStart, lte: monthEnd },
    },
  });

  // 4. Group by supervisor
  const supervisorMap = new Map<string, SupervisorReport>();

  for (const emp of employees) {
    const key = emp.supervisorEmail.toLowerCase();

    if (!supervisorMap.has(key)) {
      supervisorMap.set(key, {
        supervisorEmail: emp.supervisorEmail,
        supervisorName: emp.supervisorName,
        employees: [],
      });
    }

    // Balance by period
    const balanceByPeriod = emp.vacationAccruals.map((a) => ({
      accrualYear: a.accrualYear,
      totalDaysAccrued: a.totalDaysAccrued,
      totalDaysConsumed: a.totalDaysConsumed,
      remainingBalance: a.remainingBalance,
    }));

    // Vacation movements this month
    const empVacConsumptions = consumptions.filter(
      (c) => c.accrual.employeeId === emp.id && c.vacationRequest
    );
    const vacacionesTomadas: VacationMovement[] = empVacConsumptions.map((c) => ({
      requestId: c.vacationRequestId || "",
      dateFrom: c.vacationRequest!.dateFrom.toISOString().split("T")[0],
      dateTo: c.vacationRequest!.dateTo.toISOString().split("T")[0],
      totalDays: c.vacationRequest!.totalDays,
      daysConsumed: c.daysConsumed,
      accrualYear: c.accrual.accrualYear,
    }));

    // Cash-out movements this month
    const empCashConsumptions = consumptions.filter(
      (c) => c.accrual.employeeId === emp.id && c.cashOutRequest
    );
    const vacacionesEnDinero: CashOutMovement[] = empCashConsumptions.map((c) => ({
      requestId: c.cashOutRequestId || "",
      daysConsumed: c.daysConsumed,
      accrualYear: c.accrual.accrualYear,
    }));

    // Manual adjustments this month
    const empAdjustments = adjustments.filter((a) => a.employeeId === emp.id);
    const ajustesManuales: AdjustmentMovement[] = empAdjustments.map((a) => ({
      adjustmentType: a.adjustmentType,
      accrualYear: a.accrualYear,
      daysDelta: a.daysDelta,
      reason: a.reason,
      adjustedBy: a.adjustedBy,
    }));

    // Accrual increments this month
    const devengamientoDelMes: AccrualMovement[] = [];
    for (const accrual of emp.vacationAccruals) {
      const increment = calculateAccrualIncrementForMonth(
        accrual.accrualStartDate,
        accrual.accrualEndDate,
        targetYear,
        targetMonth
      );
      if (increment > 0) {
        const prevAccrued = accrual.totalDaysAccrued - increment;
        devengamientoDelMes.push({
          accrualYear: accrual.accrualYear,
          previousAccrued: Math.max(0, prevAccrued),
          currentAccrued: accrual.totalDaysAccrued,
          increment,
        });
      }
    }

    const hasMovements =
      vacacionesTomadas.length > 0 ||
      vacacionesEnDinero.length > 0 ||
      ajustesManuales.length > 0 ||
      devengamientoDelMes.length > 0;

    const employeeReport: EmployeeMonthlyReport = {
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      email: emp.email,
      costCenter: emp.costCenter,
      balanceByPeriod,
      movements: {
        vacacionesTomadas,
        vacacionesEnDinero,
        ajustesManuales,
        devengamientoDelMes,
      },
    };

    // Include employee if they have balance or movements
    if (balanceByPeriod.length > 0 || hasMovements) {
      supervisorMap.get(key)!.employees.push(employeeReport);
    }
  }

  // Filter out supervisors with no employees
  return Array.from(supervisorMap.values()).filter(
    (s) => s.employees.length > 0
  );
}
