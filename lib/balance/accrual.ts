import { prisma } from "@/lib/prisma";

const MONTHLY_RATE = 2.5;
const MAX_DAYS_PER_YEAR = 30;

export async function recalculateAccruals(employeeId: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) return;

  const hireDate = employee.hireDate;
  const hireYear = hireDate.getFullYear();
  const currentYear = new Date().getFullYear();
  const now = new Date();

  for (let year = hireYear; year <= currentYear; year++) {
    const accrualStart =
      year === hireYear
        ? hireDate
        : new Date(year, hireDate.getMonth(), hireDate.getDate());
    const accrualEnd = new Date(
      year + 1,
      hireDate.getMonth(),
      hireDate.getDate()
    );

    let monthsInPeriod: number;
    if (now >= accrualEnd) {
      monthsInPeriod = 12;
    } else if (now < accrualStart) {
      monthsInPeriod = 0;
    } else {
      monthsInPeriod = Math.max(
        0,
        (now.getFullYear() - accrualStart.getFullYear()) * 12 +
          now.getMonth() -
          accrualStart.getMonth()
      );
    }

    const totalAccrued = Math.min(MAX_DAYS_PER_YEAR, monthsInPeriod * MONTHLY_RATE);

    const existing = await prisma.vacationAccrual.findUnique({
      where: { employeeId_accrualYear: { employeeId, accrualYear: year } },
    });

    if (existing) {
      await prisma.vacationAccrual.update({
        where: { id: existing.id },
        data: {
          monthsAccrued: monthsInPeriod,
          totalDaysAccrued: totalAccrued,
          remainingBalance: totalAccrued - existing.totalDaysConsumed,
        },
      });
    } else {
      await prisma.vacationAccrual.create({
        data: {
          employeeId,
          accrualYear: year,
          accrualStartDate: accrualStart,
          accrualEndDate: accrualEnd,
          monthlyRate: MONTHLY_RATE,
          monthsAccrued: monthsInPeriod,
          totalDaysAccrued: totalAccrued,
          totalDaysConsumed: 0,
          remainingBalance: totalAccrued,
        },
      });
    }
  }
}
