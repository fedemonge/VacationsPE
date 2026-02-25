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

const CASH_OUT_MAX_PER_PERIOD = 15;

export async function consumeCashOutDaysFIFO(
  employeeId: string,
  cashOutRequestId: string,
  totalDays: number
): Promise<FIFOResult> {
  // Step 1: Temporarily free programmed (future, not yet started) vacation allocations
  // so that cash-out can consume from the oldest periods first (FIFO priority)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allEmployeeAccruals = await prisma.vacationAccrual.findMany({
    where: { employeeId },
    orderBy: { accrualYear: "asc" },
  });
  const accrualIds = allEmployeeAccruals.map((a) => a.id);

  const programmedConsumptions = await prisma.vacationConsumption.findMany({
    where: {
      vacationRequestId: { not: null },
      accrualId: { in: accrualIds },
    },
    include: {
      vacationRequest: { select: { id: true, dateFrom: true, status: true, totalDays: true } },
    },
  });

  const futureProgrammed = programmedConsumptions.filter((pc) => {
    if (!pc.vacationRequest) return false;
    const dateFrom = new Date(pc.vacationRequest.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    return pc.vacationRequest.status === "APROBADA" && dateFrom > today;
  });

  // Reverse programmed vacation consumptions to free up balance in older periods
  for (const pc of futureProgrammed) {
    await prisma.vacationAccrual.update({
      where: { id: pc.accrualId },
      data: {
        totalDaysConsumed: { decrement: pc.daysConsumed },
        remainingBalance: { increment: pc.daysConsumed },
      },
    });
    await prisma.vacationConsumption.delete({ where: { id: pc.id } });
  }

  // Step 2: Run cash-out FIFO on the now-freed balance
  const accruals = await prisma.vacationAccrual.findMany({
    where: { employeeId, remainingBalance: { gt: 0 } },
    orderBy: { accrualYear: "asc" },
  });

  const existingCashOuts = await prisma.vacationConsumption.groupBy({
    by: ["accrualId"],
    where: {
      cashOutRequestId: { not: null },
      accrualId: { in: accruals.map((a) => a.id) },
    },
    _sum: { daysConsumed: true },
  });

  const cashedOutByAccrual = new Map(
    existingCashOuts.map((e) => [e.accrualId, e._sum.daysConsumed || 0])
  );

  let remaining = totalDays;
  const consumptions: FIFOResult["consumptions"] = [];

  for (const accrual of accruals) {
    if (remaining <= 0) break;

    const alreadyCashedOut = cashedOutByAccrual.get(accrual.id) || 0;
    const cashOutRoom = Math.max(0, CASH_OUT_MAX_PER_PERIOD - alreadyCashedOut);
    const toConsume = Math.min(remaining, accrual.remainingBalance, cashOutRoom);

    if (toConsume <= 0) continue;

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
        cashOutRequestId,
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

  // Step 3: Re-apply programmed vacation consumptions using regular FIFO
  // They will now consume from whatever periods have remaining balance
  const programmedRequestIds = Array.from(
    new Set(
      futureProgrammed
        .filter((pc) => pc.vacationRequestId)
        .map((pc) => pc.vacationRequestId as string)
    )
  );

  for (const reqId of programmedRequestIds) {
    const totalDaysForReq = futureProgrammed
      .filter((pc) => pc.vacationRequestId === reqId)
      .reduce((sum, pc) => sum + pc.daysConsumed, 0);
    await consumeVacationDaysFIFO(employeeId, reqId, totalDaysForReq);
  }

  return {
    success: remaining <= 0,
    consumptions,
    totalConsumed: totalDays - Math.max(0, remaining),
    shortfall: Math.max(0, remaining),
  };
}

export async function getAvailableCashOut(employeeId: string): Promise<{
  totalAvailable: number;
  byPeriod: { accrualYear: number; remaining: number; cashOutUsed: number; cashOutAvailable: number }[];
}> {
  // Get ALL accruals (not just remaining > 0) because programmed vacation days
  // would be reallocated on cash-out, freeing up balance in older periods
  const accruals = await prisma.vacationAccrual.findMany({
    where: { employeeId },
    orderBy: { accrualYear: "asc" },
  });

  const accrualIds = accruals.map((a) => a.id);

  const existingCashOuts = await prisma.vacationConsumption.groupBy({
    by: ["accrualId"],
    where: {
      cashOutRequestId: { not: null },
      accrualId: { in: accrualIds },
    },
    _sum: { daysConsumed: true },
  });

  const cashedOutByAccrual = new Map(
    existingCashOuts.map((e) => [e.accrualId, e._sum.daysConsumed || 0])
  );

  // Calculate programmed (future, not started) vacation days per accrual
  // These would be reallocated to later periods when processing a cash-out
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allConsumptions = await prisma.vacationConsumption.findMany({
    where: {
      vacationRequestId: { not: null },
      accrualId: { in: accrualIds },
    },
    include: {
      vacationRequest: { select: { dateFrom: true, status: true } },
    },
  });

  const programmedByAccrual = new Map<string, number>();
  for (const c of allConsumptions) {
    if (!c.vacationRequest) continue;
    const dateFrom = new Date(c.vacationRequest.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    if (c.vacationRequest.status === "APROBADA" && dateFrom > today) {
      const current = programmedByAccrual.get(c.accrualId) || 0;
      programmedByAccrual.set(c.accrualId, current + c.daysConsumed);
    }
  }

  const byPeriod = accruals.map((a) => {
    const cashOutUsed = cashedOutByAccrual.get(a.id) || 0;
    const programmedDays = programmedByAccrual.get(a.id) || 0;
    // Effective remaining includes programmed days (they would be reallocated on cash-out)
    const effectiveRemaining = a.remainingBalance + programmedDays;
    const cashOutAvailable = Math.min(
      effectiveRemaining,
      Math.max(0, CASH_OUT_MAX_PER_PERIOD - cashOutUsed)
    );
    return {
      accrualYear: a.accrualYear,
      remaining: effectiveRemaining,
      cashOutUsed,
      cashOutAvailable,
    };
  }).filter((p) => p.remaining > 0);

  const totalAvailable = byPeriod.reduce((sum, p) => sum + p.cashOutAvailable, 0);

  return { totalAvailable, byPeriod };
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
