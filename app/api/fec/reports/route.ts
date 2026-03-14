import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const companyId = searchParams.get("companyId");
    const year = searchParams.get("year");
    const periodMonth = searchParams.get("periodMonth");

    if (!type) {
      return NextResponse.json(
        { error: "El parámetro 'type' es obligatorio (upcoming, monthly, overdue)" },
        { status: 400 }
      );
    }

    // Build base where clause with optional filters
    const buildBaseWhere = (statusFilter: string | Record<string, unknown>) => {
      const where: Record<string, unknown> = {};
      if (typeof statusFilter === "string") {
        where.status = statusFilter;
      } else {
        Object.assign(where, statusFilter);
      }
      if (companyId) where.companyId = companyId;
      if (year) {
        const y = parseInt(year, 10);
        where.implementationDate = {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lt: new Date(`${y + 1}-01-01T00:00:00.000Z`),
        };
      }
      return where;
    }

    const includeClause = {
      area: { select: { id: true, name: true } },
      leadEmployee: { select: { id: true, fullName: true, email: true } },
      company: { select: { id: true, name: true, code: true, currency: true } },
    };

    if (type === "upcoming") {
      const days = parseInt(searchParams.get("days") || "30", 10);
      if (![30, 60, 90].includes(days)) {
        return NextResponse.json(
          { error: "El parámetro 'days' debe ser 30, 60 o 90" },
          { status: 400 }
        );
      }

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const baseWhere = buildBaseWhere("FIRME");
      // Override implementationDate filter if year was set, to apply date range logic
      delete baseWhere.implementationDate;

      const where = {
        ...baseWhere,
        OR: [
          {
            revisedImplementationDate: { gte: now, lte: futureDate },
          },
          {
            revisedImplementationDate: null,
            implementationDate: { gte: now, lte: futureDate },
          },
        ],
      };

      const ideas = await prisma.fecIdea.findMany({
        where,
        include: includeClause,
        orderBy: { implementationDate: "asc" },
      });

      // Group by leader
      const grouped: Record<
        string,
        { leader: { id: string; fullName: string; email: string }; ideas: typeof ideas }
      > = {};

      for (const idea of ideas) {
        const leadId = idea.leadEmployee.id;
        if (!grouped[leadId]) {
          grouped[leadId] = { leader: idea.leadEmployee, ideas: [] };
        }
        grouped[leadId].ideas.push(idea);
      }

      return NextResponse.json({
        type: "upcoming",
        days,
        groups: Object.values(grouped),
        totalIdeas: ideas.length,
      });
    }

    if (type === "monthly") {
      const where = buildBaseWhere("IMPLEMENTADA");

      const ideas = await prisma.fecIdea.findMany({
        where,
        include: includeClause,
        orderBy: { implementationDate: "asc" },
      });

      // Aggregate monthly effective values (local currency and USD)
      const monthlyTotals: Record<string, { local: number; usd: number }> = {};

      for (const idea of ideas) {
        if (!idea.implementationDate) continue;
        const baseDate = new Date(idea.implementationDate);

        for (let m = 0; m < 12; m++) {
          const monthValue = (idea as Record<string, unknown>)[`month${m + 1}Value`] as number;
          const monthUsd = (idea as Record<string, unknown>)[`month${m + 1}Usd`] as number;

          if (monthValue === 0 && monthUsd === 0) continue;

          const monthDate = new Date(baseDate);
          monthDate.setMonth(monthDate.getMonth() + m);
          const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

          // Filter by periodMonth if specified
          if (periodMonth && key !== periodMonth) continue;

          if (!monthlyTotals[key]) {
            monthlyTotals[key] = { local: 0, usd: 0 };
          }
          monthlyTotals[key].local += monthValue;
          monthlyTotals[key].usd += monthUsd;
        }
      }

      // Sort by month key
      const sortedMonths = Object.entries(monthlyTotals)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, totals]) => ({ month, total: totals.local, totalUsd: totals.usd }));

      return NextResponse.json({
        type: "monthly",
        months: sortedMonths,
        totalImplementedIdeas: ideas.length,
      });
    }

    if (type === "overdue") {
      const now = new Date();

      const baseWhere = buildBaseWhere("FIRME");
      delete baseWhere.implementationDate;

      const where = {
        ...baseWhere,
        OR: [
          {
            revisedImplementationDate: { lt: now },
          },
          {
            revisedImplementationDate: null,
            implementationDate: { lt: now },
          },
        ],
      };

      const ideas = await prisma.fecIdea.findMany({
        where,
        include: includeClause,
        orderBy: { implementationDate: "asc" },
      });

      return NextResponse.json({
        type: "overdue",
        ideas,
        totalOverdue: ideas.length,
      });
    }

    return NextResponse.json(
      { error: "Tipo de reporte inválido. Tipos válidos: upcoming, monthly, overdue" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[FEC_REPORTS] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
