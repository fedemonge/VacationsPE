import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (
      !["ADMINISTRADOR", "SUPERVISOR", "RRHH", "GERENTE_PAIS"].includes(
        session.role
      )
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para ver reportes de personal" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "12");
    const costCenter = searchParams.get("costCenter");

    console.log(
      `[REPORTES_PERSONAL] GET: months=${months}, costCenter=${costCenter || "TODAS"}`
    );

    // Fetch all employees (including terminated for historical data)
    const empWhere: Record<string, unknown> = {};
    if (costCenter) empWhere.costCenter = costCenter;

    const allEmployees = await prisma.employee.findMany({ where: empWhere });

    // Fetch positions
    const posWhere: Record<string, unknown> = {};
    if (costCenter) posWhere.costCenter = costCenter;

    const allPositions = await prisma.orgPosition.findMany({
      where: posWhere,
    });

    // Fetch staff requests for KPIs
    const staffRequests = await prisma.staffRequest.findMany({
      where: costCenter ? { costCenter } : {},
    });

    // Current date info
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // KPIs
    const activeEmployees = allEmployees.filter(
      (e) => !e.terminationDate
    );
    const vacantPositions = allPositions.filter(
      (p) => p.status === "VACANTE"
    );
    const thirdPartyPositions = allPositions.filter(
      (p) => p.positionType === "TERCERO" && p.status === "OCUPADA"
    );
    const pendingRequests = staffRequests.filter((r) =>
      r.status.includes("PENDIENTE")
    );

    // Hires this month
    const hiresThisMonth = allEmployees.filter((e) => {
      const hd = new Date(e.hireDate);
      return hd >= currentMonthStart && hd <= currentMonthEnd;
    }).length;

    // Terminations this month
    const terminationsThisMonth = allEmployees.filter((e) => {
      if (!e.terminationDate) return false;
      const td = new Date(e.terminationDate);
      return td >= currentMonthStart && td <= currentMonthEnd;
    }).length;

    // Avg time to hire (for completed requests)
    const completedRequests = staffRequests.filter(
      (r) => r.approvedAt && r.hiredAt
    );
    let avgTimeToHireDays: number | null = null;
    if (completedRequests.length > 0) {
      const totalDays = completedRequests.reduce((sum, r) => {
        const diff =
          new Date(r.hiredAt!).getTime() -
          new Date(r.approvedAt!).getTime();
        return sum + diff / (1000 * 60 * 60 * 24);
      }, 0);
      avgTimeToHireDays = Math.round(totalDays / completedRequests.length);
    }

    const kpis = {
      activeHeadcount: activeEmployees.length,
      vacantPositions: vacantPositions.length,
      thirdPartyCount: thirdPartyPositions.length,
      pendingRequests: pendingRequests.length,
      avgTimeToHireDays,
      hiresThisMonth,
      terminationsThisMonth,
    };

    // Monthly trend
    const monthlyTrend: {
      month: string;
      monthLabel: string;
      hires: number;
      terminations: number;
      headcount: number;
      vacantPositions: number;
      thirdPartyCount: number;
    }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0,
        23,
        59,
        59
      );
      const monthStr = `${monthDate.getFullYear()}-${String(
        monthDate.getMonth() + 1
      ).padStart(2, "0")}`;
      const monthLabel = monthDate.toLocaleDateString("es-PE", {
        month: "long",
        year: "numeric",
      });

      // Hires in this month
      const hires = allEmployees.filter((e) => {
        const hd = new Date(e.hireDate);
        return (
          hd.getFullYear() === monthDate.getFullYear() &&
          hd.getMonth() === monthDate.getMonth()
        );
      }).length;

      // Terminations in this month
      const terminations = allEmployees.filter((e) => {
        if (!e.terminationDate) return false;
        const td = new Date(e.terminationDate);
        return (
          td.getFullYear() === monthDate.getFullYear() &&
          td.getMonth() === monthDate.getMonth()
        );
      }).length;

      // Headcount at end of month
      const headcount = allEmployees.filter((e) => {
        const hired = new Date(e.hireDate) <= monthEnd;
        const notTerminated =
          !e.terminationDate || new Date(e.terminationDate) > monthEnd;
        return hired && notTerminated;
      }).length;

      monthlyTrend.push({
        month: monthStr,
        monthLabel,
        hires,
        terminations,
        headcount,
        vacantPositions: vacantPositions.length,
        thirdPartyCount: thirdPartyPositions.length,
      });
    }

    return NextResponse.json({
      kpis,
      monthlyTrend,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[REPORTES_PERSONAL] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
