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
    const tipoBase = searchParams.get("tipoBase");
    const grupo = searchParams.get("grupo");
    const dayParam = searchParams.get("day");
    const tipoCierre = searchParams.get("tipoCierre");

    const where: Record<string, unknown> = { periodoYear, periodoMonth };
    if (agenteCampo) where.agenteCampo = agenteCampo;
    if (esAgendado !== null && esAgendado !== undefined && esAgendado !== "") {
      where.esAgendado = esAgendado === "true";
    }
    if (tipoBase) where.tipoBase = tipoBase;
    if (grupo) where.grupo = { contains: grupo };
    if (dayParam) where.periodoDay = parseInt(dayParam, 10);
    if (tipoCierre) where.tipoCierre = tipoCierre;

    // Get all tasks with fechaCierre for the filtered period
    const tasks = await prisma.recuperoTask.findMany({
      where,
      select: {
        fechaCierre: true,
        tipoCierre: true,
      },
    });

    // Initialize hourly buckets (0-23)
    const hourly: { hour: number; exitosas: number; noExitosas: number; total: number }[] = [];
    for (let h = 0; h < 24; h++) {
      hourly.push({ hour: h, exitosas: 0, noExitosas: 0, total: 0 });
    }

    // Bucket each task by the hour of its fechaCierre.
    // Dates are stored as Lima local time (UTC-naive from parseDate), so getUTCHours()
    // directly returns the Lima hour — no offset conversion needed.
    for (const task of tasks) {
      if (!task.fechaCierre) continue;
      const date = new Date(task.fechaCierre);
      const hour = date.getUTCHours(); // Already Lima local time
      if (hour < 0 || hour > 23) continue;

      hourly[hour].total++;
      if (task.tipoCierre === "RECUPERADO WODEN") {
        hourly[hour].exitosas++;
      } else {
        hourly[hour].noExitosas++;
      }
    }

    // Format hour labels
    const chartData = hourly.map(h => ({
      hour: `${h.hour.toString().padStart(2, "0")}:00`,
      exitosas: h.exitosas,
      noExitosas: h.noExitosas,
      total: h.total,
    }));

    return NextResponse.json({ chartData });
  } catch (error) {
    console.error("[RECUPERO CHART-HOURLY] ERROR:", error);
    return NextResponse.json({ error: "Error al generar datos horarios" }, { status: 500 });
  }
}
