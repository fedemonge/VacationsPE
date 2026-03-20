import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const periodoYear = parseInt(searchParams.get("periodoYear") || String(new Date().getFullYear()), 10);
    const periodoMonth = parseInt(searchParams.get("periodoMonth") || String(new Date().getMonth() + 1), 10);
    const agenteCampo = searchParams.get("agenteCampo") || "";
    const esAgendado = searchParams.get("esAgendado");

    const departamento = searchParams.get("departamento");
    const tipoBase = searchParams.get("tipoBase");
    const grupo = searchParams.get("grupo");

    // Company-wide base (no agent filter) for the effectiveness line
    const companyWhere: Record<string, unknown> = { periodoYear, periodoMonth };
    if (esAgendado !== null && esAgendado !== undefined && esAgendado !== "") {
      companyWhere.esAgendado = esAgendado === "true";
    }
    if (departamento) companyWhere.departamento = departamento;
    if (tipoBase) companyWhere.tipoBase = tipoBase;
    if (grupo) companyWhere.grupo = { contains: grupo };

    // Agent-specific base (includes agent filter if selected)
    const agentWhere: Record<string, unknown> = { ...companyWhere };
    if (agenteCampo) agentWhere.agenteCampo = agenteCampo;

    // Get all days — use agent-filtered if agent selected, otherwise company
    const allDays = await prisma.recuperoTask.groupBy({
      by: ["periodoDay"],
      where: companyWhere,
      _count: { id: true },
      orderBy: { periodoDay: "asc" },
    });

    const days = allDays.map(d => d.periodoDay).filter(d => d != null).sort((a, b) => (a ?? 0) - (b ?? 0));

    // For each day, get company totals and agent totals
    const chartData = await Promise.all(
      days.map(async (day) => {
        const companyDay = { ...companyWhere, periodoDay: day };
        const agentDay = { ...agentWhere, periodoDay: day };

        const [companyTotal, companyExitosas, agentTotal, agentExitosas] = await Promise.all([
          prisma.recuperoTask.count({ where: companyDay }),
          prisma.recuperoTask.count({ where: { ...companyDay, tipoCierre: "RECUPERADO WODEN" } }),
          prisma.recuperoTask.count({ where: agentDay }),
          prisma.recuperoTask.count({ where: { ...agentDay, tipoCierre: "RECUPERADO WODEN" } }),
        ]);

        return {
          day,
          companyTotal,
          companyExitosas,
          companyEfectividad: companyTotal > 0 ? Math.round((companyExitosas / companyTotal) * 1000) / 10 : 0,
          agentTotal,
          agentExitosas,
          agentNoExitosas: agentTotal - agentExitosas,
          agentEfectividad: agentTotal > 0 ? Math.round((agentExitosas / agentTotal) * 1000) / 10 : 0,
        };
      })
    );

    return NextResponse.json({ chartData });
  } catch (error) {
    console.error("[RECUPERO CHART] ERROR:", error);
    return NextResponse.json({ error: "Error al generar datos del gráfico" }, { status: 500 });
  }
}
