import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateWebhookOrSession } from "@/lib/webhook-auth";
import type {
  OverdueSupervisorGroup,
  OverdueEmployeeDetail,
} from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { authorized } = await validateWebhookOrSession(request);
    if (!authorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    // Query accruals where period ended > 12 months ago and still has balance
    const overdueAccruals = await prisma.vacationAccrual.findMany({
      where: {
        accrualEndDate: { lt: cutoffDate },
        remainingBalance: { gt: 0 },
        employee: { terminationDate: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
            supervisorName: true,
            supervisorEmail: true,
            costCenter: true,
          },
        },
      },
      orderBy: { accrualYear: "asc" },
    });

    // Get country manager email
    const gerenteConfig = await prisma.systemConfiguration.findFirst({
      where: { key: "GERENTE_PAIS_EMAIL" },
    });
    const countryManagerEmail = gerenteConfig?.value || "";

    // Group by supervisor
    const supervisorMap = new Map<string, OverdueSupervisorGroup>();

    for (const accrual of overdueAccruals) {
      const emp = accrual.employee;
      const key = emp.supervisorEmail.toLowerCase();

      if (!supervisorMap.has(key)) {
        supervisorMap.set(key, {
          supervisorEmail: emp.supervisorEmail,
          supervisorName: emp.supervisorName,
          totalOverdueDays: 0,
          employees: [],
        });
      }

      const group = supervisorMap.get(key)!;

      // Find or create employee entry
      let empEntry = group.employees.find(
        (e) => e.employeeCode === emp.employeeCode
      );
      if (!empEntry) {
        empEntry = {
          employeeCode: emp.employeeCode,
          fullName: emp.fullName,
          email: emp.email,
          costCenter: emp.costCenter,
          totalOverdueDays: 0,
          overduePeriods: [],
        } as OverdueEmployeeDetail;
        group.employees.push(empEntry);
      }

      const accrualEnd = new Date(accrual.accrualEndDate);
      const monthsOverdue = Math.max(
        0,
        (now.getFullYear() - accrualEnd.getFullYear()) * 12 +
          now.getMonth() - accrualEnd.getMonth() - 12
      );

      empEntry.overduePeriods.push({
        accrualYear: accrual.accrualYear,
        accrualEndDate: accrual.accrualEndDate.toISOString().split("T")[0],
        remainingBalance: accrual.remainingBalance,
        monthsOverdue,
      });

      empEntry.totalOverdueDays += accrual.remainingBalance;
      group.totalOverdueDays += accrual.remainingBalance;
    }

    const supervisors = Array.from(supervisorMap.values());
    const totalOverdueEmployees = supervisors.reduce(
      (sum, s) => sum + s.employees.length,
      0
    );
    const totalOverdueDays = supervisors.reduce(
      (sum, s) => sum + s.totalOverdueDays,
      0
    );

    console.log(
      `[ALERTAS] VENCIDAS: ${totalOverdueEmployees} empleados con ${totalOverdueDays} días vencidos`
    );

    return NextResponse.json({
      generatedAt: now.toISOString(),
      cutoffDate: cutoffDate.toISOString().split("T")[0],
      countryManagerEmail,
      totalOverdueEmployees,
      totalOverdueDays,
      supervisors,
    });
  } catch (error) {
    console.error("[ALERTAS] VENCIDAS ERROR:", error);
    return NextResponse.json(
      { error: "Error al generar alerta de vacaciones vencidas" },
      { status: 500 }
    );
  }
}
