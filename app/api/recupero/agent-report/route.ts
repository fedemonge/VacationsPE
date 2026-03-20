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

    const grupoParam = searchParams.get("grupo");
    const tipoBaseParam = searchParams.get("tipoBase");

    // Build period filter
    const periodWhere: Record<string, unknown> = { periodoYear };
    if (periodoMonth) periodWhere.periodoMonth = periodoMonth;
    if (dayParam) periodWhere.periodoDay = dayParam;
    if (grupoParam) periodWhere.grupo = { contains: grupoParam };
    if (tipoBaseParam) periodWhere.tipoBase = tipoBaseParam;

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

    // === Trend — respect trendView param ===
    const trendViewParam = searchParams.get("trendView") || "daily";
    const trendGroupBy = trendViewParam === "monthly" ? "periodoMonth" : "periodoDay";

    // For monthly view, use year-only filter (all months); for daily, use current period filter
    const trendPeriodWhere: Record<string, unknown> = trendViewParam === "monthly"
      ? { periodoYear }
      : periodWhere;
    const trendAgentWhere: Record<string, unknown> = trendViewParam === "monthly"
      ? { periodoYear, agenteCampo }
      : agentWhere;

    const agentTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: trendAgentWhere,
      _count: { id: true },
    });

    const agentExitosasTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: { ...trendAgentWhere, tipoCierre: "RECUPERADO WODEN" },
      _count: { id: true },
    });

    const companyTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: trendPeriodWhere,
      _count: { id: true },
    });

    const companyExitosasTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: { ...trendPeriodWhere, tipoCierre: "RECUPERADO WODEN" },
      _count: { id: true },
    });

    const agentQuemadasTrend = await prisma.recuperoTask.groupBy({
      by: [trendGroupBy],
      where: { ...trendAgentWhere, esQuemada: true },
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
    const agentQMap = toMap(agentQuemadasTrend);
    const companyTotalMap = toMap(companyTrend);
    const companyExMap = toMap(companyExitosasTrend);

    const trend = sortedPeriods.map(p => {
      const aTotal = agentTotalMap.get(p) || 0;
      const aEx = agentExMap.get(p) || 0;
      const aQ = agentQMap.get(p) || 0;
      const cTotal = companyTotalMap.get(p) || 0;
      const cEx = companyExMap.get(p) || 0;
      return {
        period: p,
        agentTotal: aTotal,
        agentExitosas: aEx,
        agentNoExitosas: aTotal - aEx - aQ,
        agentQuemadas: aQ,
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
    const [tipoCierreBreakdown, quemadasByTipo] = await Promise.all([
      prisma.recuperoTask.groupBy({
        by: ["tipoCierre"],
        where: { ...agentWhere, tipoCierre: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.recuperoTask.groupBy({
        by: ["tipoCierre"],
        where: { ...agentWhere, tipoCierre: { not: null }, esQuemada: true },
        _count: { id: true },
      }),
    ]);

    const quemadasMap = new Map<string, number>();
    quemadasByTipo.forEach(q => { if (q.tipoCierre) quemadasMap.set(q.tipoCierre, q._count.id); });

    const resultados = tipoCierreBreakdown.map(r => ({
      tipoCierre: r.tipoCierre || "Sin resultado",
      count: r._count.id,
      pct: agentTotal > 0 ? Math.round((r._count.id / agentTotal) * 1000) / 10 : 0,
      quemadas: quemadasMap.get(r.tipoCierre || "") || 0,
    }));

    return NextResponse.json({
      agenteCampo,
      periodoYear,
      periodoMonth,
      day: dayParam,
      kpis,
      trend,
      trendType: trendViewParam,
      hourly: hourly.map(h => ({ ...h, hour: `${h.hour.toString().padStart(2, "0")}:00` })),
      resultados,
    });
  } catch (error) {
    console.error("[AGENT REPORT] ERROR:", error);
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
