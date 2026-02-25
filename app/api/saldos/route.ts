import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const costCenter = searchParams.get("costCenter");

  const employeeWhere: Record<string, unknown> = { terminationDate: null };
  if (costCenter) employeeWhere.costCenter = costCenter;
  if (employeeId) employeeWhere.id = employeeId;

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: {
      vacationAccruals: {
        orderBy: { accrualYear: "asc" },
        include: {
          consumptions: {
            include: {
              vacationRequest: {
                select: {
                  id: true,
                  dateFrom: true,
                  dateTo: true,
                  totalDays: true,
                  status: true,
                },
              },
              cashOutRequest: {
                select: {
                  id: true,
                  daysRequested: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
      vacationRequests: {
        where: {
          status: { notIn: ["RECHAZADA", "CANCELADA"] },
        },
        orderBy: { dateFrom: "asc" },
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          totalDays: true,
          status: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const balances = employees.map((emp) => {
    const accruals = emp.vacationAccruals.map((a) => {
      const consumptions = a.consumptions.map((c) => {
        if (c.cashOutRequest) {
          // Cash-out consumption — always treated as "TOMADA" (already deducted)
          return {
            id: c.id,
            daysConsumed: c.daysConsumed,
            requestId: c.cashOutRequestId,
            dateFrom: c.cashOutRequest.createdAt,
            dateTo: c.cashOutRequest.createdAt,
            totalRequestDays: c.cashOutRequest.daysRequested,
            status: c.cashOutRequest.status,
            type: "DINERO" as string,
          };
        }

        if (!c.vacationRequest) {
          return {
            id: c.id,
            daysConsumed: c.daysConsumed,
            requestId: c.vacationRequestId,
            dateFrom: c.consumedAt,
            dateTo: c.consumedAt,
            totalRequestDays: c.daysConsumed,
            status: "DESCONOCIDO",
            type: "TOMADA" as string,
          };
        }

        const dateTo = new Date(c.vacationRequest.dateTo);
        const dateFrom = new Date(c.vacationRequest.dateFrom);
        dateTo.setHours(0, 0, 0, 0);
        dateFrom.setHours(0, 0, 0, 0);

        let type: string;
        if (dateTo < today) {
          type = "TOMADA";
        } else if (dateFrom <= today) {
          type = "EN_CURSO";
        } else {
          type = "PROGRAMADA";
        }

        return {
          id: c.id,
          daysConsumed: c.daysConsumed,
          requestId: c.vacationRequestId,
          dateFrom: c.vacationRequest.dateFrom,
          dateTo: c.vacationRequest.dateTo,
          totalRequestDays: c.vacationRequest.totalDays,
          status: c.vacationRequest.status,
          type,
        };
      });

      const trackedConsumed = consumptions.reduce(
        (sum, c) => sum + c.daysConsumed,
        0
      );

      const trackedTaken = consumptions
        .filter((c) => c.type === "TOMADA" || c.type === "EN_CURSO" || c.type === "DINERO")
        .reduce((sum, c) => sum + c.daysConsumed, 0);

      const daysProgrammed = consumptions
        .filter((c) => c.type === "PROGRAMADA")
        .reduce((sum, c) => sum + c.daysConsumed, 0);

      // Untracked consumed days (from manual adjustments / initial loads)
      const untrackedConsumed = Math.max(
        0,
        a.totalDaysConsumed - trackedConsumed
      );

      // Total taken = untracked (historical) + tracked taken/in-progress
      const daysTaken = untrackedConsumed + trackedTaken;

      return {
        accrualYear: a.accrualYear,
        totalDaysAccrued: a.totalDaysAccrued,
        totalDaysConsumed: a.totalDaysConsumed,
        remainingBalance: a.remainingBalance,
        monthsAccrued: a.monthsAccrued,
        daysTaken,
        daysProgrammed,
        untrackedConsumed,
        effectiveBalance: a.totalDaysAccrued - daysTaken,
        consumptions,
      };
    });

    // Pending requests (not yet approved, no consumptions yet)
    const pendingRequests = emp.vacationRequests
      .filter((r) => r.status.includes("PENDIENTE"))
      .map((r) => ({
        id: r.id,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        totalDays: r.totalDays,
        status: r.status,
      }));

    const totalEffective = accruals.reduce(
      (sum, a) => sum + a.effectiveBalance,
      0
    );
    const totalProgrammed = accruals.reduce(
      (sum, a) => sum + a.daysProgrammed,
      0
    );

    return {
      id: emp.id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      costCenter: emp.costCenter,
      accruals,
      pendingRequests,
      totalAvailable: emp.vacationAccruals.reduce(
        (sum, a) => sum + a.remainingBalance,
        0
      ),
      totalEffective,
      totalProgrammed,
    };
  });

  return NextResponse.json({ balances });
}
