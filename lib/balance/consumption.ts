import { prisma } from "@/lib/prisma";

interface FIFOResult {
  success: boolean;
  consumptions: { accrualId: string; accrualYear: number; daysConsumed: number }[];
  totalConsumed: number;
  shortfall: number;
}

export async function consumeVacationDaysFIFO(
  employeeId: string,
  vacationRequestId: string,
  totalDays: number
): Promise<FIFOResult> {
  const accruals = await prisma.vacationAccrual.findMany({
    where: { employeeId, remainingBalance: { gt: 0 } },
    orderBy: { accrualYear: "asc" },
  });

  let remaining = totalDays;
  const consumptions: FIFOResult["consumptions"] = [];

  for (const accrual of accruals) {
    if (remaining <= 0) break;

    const toConsume = Math.min(remaining, accrual.remainingBalance);

    await prisma.vacationAccrual.update({
      where: { id: accrual.id },
      data: {
        totalDaysConsumed: { increment: toConsume },
        remainingBalance: { decrement: toConsume },
      },
    });

    await prisma.vacationConsumption.create({
      data: {
        accrualId: accrual.id,
        vacationRequestId,
        daysConsumed: toConsume,
      },
    });

    consumptions.push({
      accrualId: accrual.id,
      accrualYear: accrual.accrualYear,
      daysConsumed: toConsume,
    });

    remaining -= toConsume;
  }

  return {
    success: remaining <= 0,
    consumptions,
    totalConsumed: totalDays - Math.max(0, remaining),
    shortfall: Math.max(0, remaining),
  };
}

export async function getAvailableBalance(employeeId: string): Promise<{
  totalAvailable: number;
  byPeriod: { accrualYear: number; remaining: number; accrued: number; consumed: number }[];
}> {
  const accruals = await prisma.vacationAccrual.findMany({
    where: { employeeId },
    orderBy: { accrualYear: "asc" },
  });

  const byPeriod = accruals.map((a) => ({
    accrualYear: a.accrualYear,
    remaining: a.remainingBalance,
    accrued: a.totalDaysAccrued,
    consumed: a.totalDaysConsumed,
  }));

  const totalAvailable = byPeriod.reduce((sum, p) => sum + p.remaining, 0);

  return { totalAvailable, byPeriod };
}

export async function reverseConsumption(vacationRequestId: string): Promise<void> {
  const consumptions = await prisma.vacationConsumption.findMany({
    where: { vacationRequestId },
  });

  for (const c of consumptions) {
    await prisma.vacationAccrual.update({
      where: { id: c.accrualId },
      data: {
        totalDaysConsumed: { decrement: c.daysConsumed },
        remainingBalance: { increment: c.daysConsumed },
      },
    });
  }

  await prisma.vacationConsumption.deleteMany({
    where: { vacationRequestId },
  });
}
