import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const agenteCampo = searchParams.get("agenteCampo");
    const periodoYear = parseInt(searchParams.get("periodoYear") || String(new Date().getFullYear()), 10);
    const periodoMonth = searchParams.get("periodoMonth") ? parseInt(searchParams.get("periodoMonth")!, 10) : null;
    const dayParam = searchParams.get("day") ? parseInt(searchParams.get("day")!, 10) : null;

    if (!agenteCampo) {
      return NextResponse.json({ error: "agenteCampo requerido" }, { status: 400 });
    }

    // Build period filter
    const periodWhere: Record<string, unknown> = { periodoYear };
    if (periodoMonth) periodWhere.periodoMonth = periodoMonth;
    if (dayParam) periodWhere.periodoDay = dayParam;

    const agentWhere = { ...periodWhere, agenteCampo };

    // === KPIs: Agent vs Company ===
    const [
      agentTotal, agentExitosas, agentQuemadas, agentSinCoords,
      companyTotal, companyExitosas, companyQuemadas, companySinCoords,
    ] = await Promise.all([
      prisma.recuperoTask.count({ where: agentWhere }),
      prisma.recuperoTask.count({ where: { ...agentWhere, tipoCierre: "RECUPERADO WODEN" } }),
      prisma.recuperoTask.count({ where: { ...agentWhere, esQuemada: true } }),
      prisma.recuperoTask.count({ where: { ...agentWhere, coordStatus: "MISSING" } }),
      prisma.recuperoTask.count({ where: periodWhere }),
      prisma.recuperoTask.count({ where: { ...periodWhere, tipoCierre: "RECUPERADO WODEN" } }),
      prisma.recuperoTask.count({ where: { ...periodWhere, esQuemada: true } }),
      prisma.recuperoTask.count({ where: { ...periodWhere, coordStatus: "MISSING" } }),
    ]);

    // Unique agents count for per-agent average
    const agentCount = await prisma.recuperoTask.groupBy({
      by: ["agenteCampo"],
      where: periodWhere,
    });
    const numAgents = agentCount.length || 1;

    const kpis = {
      agent: {
        total: agentTotal,
        exitosas: agentExitosas,
        noExitosas: agentTotal - agentExitosas,
        quemadas: agentQuemadas,
        sinCoords: agentSinCoords,
        efectividad: agentTotal > 0 ? Math.round((agentExitosas / agentTotal) * 1000) / 10 : 0,
        tasaQuemadas: agentTotal > 0 ? Math.round((agentQuemadas / agentTotal) * 1000) / 10 : 0,
      },
      company: {
        total: companyTotal,
        exitosas: companyExitosas,
        noExitosas: companyTotal - companyExitosas,
        quemadas: companyQuemadas,
        sinCoords: companySinCoords,
        efectividad: companyTotal > 0 ? Math.round((companyExitosas / companyTotal) * 1000) / 10 : 0,
        tasaQuemadas: companyTotal > 0 ? Math.round((companyQuemadas / companyTotal) * 1000) / 10 : 0,
        avgPerAgent: Math.round(companyTotal / numAgents),
        numAgents,
      },
    };

    // === Daily Trend (for the selected month or all months) ===
    const trendGroupBy = periodoMonth ? "periodoDay" : "periodoMonth";

    const agentTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: agentWhere,
      _count: { id: true },
    });

    const agentExitosasTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: { ...agentWhere, tipoCierre: "RECUPERADO WODEN" },
      _count: { id: true },
    });

    const companyTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: periodWhere,
      _count: { id: true },
    });

    const companyExitosasTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: { ...periodWhere, tipoCierre: "RECUPERADO WODEN" },
      _count: { id: true },
    });

    // Merge into chart data
    const allPeriods = new Set<number>();
    agentTrend.forEach(r => { if (r[trendGroupBy] != null) allPeriods.add(r[trendGroupBy] as number); });
    companyTrend.forEach(r => { if (r[trendGroupBy] != null) allPeriods.add(r[trendGroupBy] as number); });

    const sortedPeriods = Array.from(allPeriods).sort((a, b) => a - b);

    const toMap = (arr: typeof agentTrend) => {
      const m = new Map<number, number>();
      arr.forEach(r => { if (r[trendGroupBy] != null) m.set(r[trendGroupBy] as number, r._count.id); });
      return m;
    };

    const agentTotalMap = toMap(agentTrend);
    const agentExMap = toMap(agentExitosasTrend);
    const companyTotalMap = toMap(companyTrend);
    const companyExMap = toMap(companyExitosasTrend);

    const trend = sortedPeriods.map(p => {
      const aTotal = agentTotalMap.get(p) || 0;
      const aEx = agentExMap.get(p) || 0;
      const cTotal = companyTotalMap.get(p) || 0;
      const cEx = companyExMap.get(p) || 0;
      return {
        period: p,
        agentTotal: aTotal,
        agentExitosas: aEx,
        agentNoExitosas: aTotal - aEx,
        agentEfectividad: aTotal > 0 ? Math.round((aEx / aTotal) * 1000) / 10 : 0,
        companyEfectividad: cTotal > 0 ? Math.round((cEx / cTotal) * 1000) / 10 : 0,
      };
    });

    // === Hourly distribution ===
    const agentTasks = await prisma.recuperoTask.findMany({
      where: agentWhere,
      select: { fechaCierre: true, tipoCierre: true },
    });

    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, exitosas: 0, noExitosas: 0 }));
    for (const t of agentTasks) {
      if (!t.fechaCierre) continue;
      const utcH = new Date(t.fechaCierre).getUTCHours();
      const h = (utcH - 5 + 24) % 24; // Convert UTC to Lima (UTC-5)
      if (h < 0 || h > 23) continue;
      if (t.tipoCierre === "RECUPERADO WODEN") hourly[h].exitosas++;
      else hourly[h].noExitosas++;
    }

    // === Top results by tipo_cierre ===
    const tipoCierreBreakdown = await prisma.recuperoTask.groupBy({
      by: ["tipoCierre"],
      where: { ...agentWhere, tipoCierre: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const resultados = tipoCierreBreakdown.map(r => ({
      tipoCierre: r.tipoCierre || "Sin resultado",
      count: r._count.id,
      pct: agentTotal > 0 ? Math.round((r._count.id / agentTotal) * 1000) / 10 : 0,
    }));

    return NextResponse.json({
      agenteCampo,
      periodoYear,
      periodoMonth,
      day: dayParam,
      kpis,
      trend,
      trendType: periodoMonth ? "daily" : "monthly",
      hourly: hourly.map(h => ({ hour: `${h.hour.toString().padStart(2, "0")}:00`, ...h })),
      resultados,
    });
  } catch (error) {
    console.error("[AGENT REPORT] ERROR:", error);
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
