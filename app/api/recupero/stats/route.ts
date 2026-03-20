import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const periodoYear = searchParams.get("periodoYear");
    const periodoMonth = searchParams.get("periodoMonth");
    const tipoBase = searchParams.get("tipoBase");
    const agenteCampo = searchParams.get("agenteCampo");
    const estado = searchParams.get("estado");
    const coordStatus = searchParams.get("coordStatus");
    const esQuemada = searchParams.get("esQuemada");
    const esAgendado = searchParams.get("esAgendado");
    const grupo = searchParams.get("grupo");

    // Build where clause
    const where: Record<string, unknown> = {};

    if (periodoYear) where.periodoYear = parseInt(periodoYear, 10);
    if (periodoMonth) where.periodoMonth = parseInt(periodoMonth, 10);
    const dayParam = searchParams.get("day");
    if (dayParam) where.periodoDay = parseInt(dayParam, 10);
    if (tipoBase) where.tipoBase = tipoBase;
    if (agenteCampo) where.agenteCampo = { contains: agenteCampo };
    if (estado) where.estado = { contains: estado };
    if (coordStatus) where.coordStatus = coordStatus;
    if (esQuemada !== null && esQuemada !== undefined && esQuemada !== "") {
      where.esQuemada = esQuemada === "true";
    }
    if (esAgendado !== null && esAgendado !== undefined && esAgendado !== "") {
      where.esAgendado = esAgendado === "true";
    }
    if (grupo) where.grupo = { contains: grupo };
    const departamento = searchParams.get("departamento");
    if (departamento) where.departamento = departamento;
    const tipoCierre = searchParams.get("tipoCierre");
    if (tipoCierre) where.tipoCierre = tipoCierre;

    const [
      total,
      quemadas,
      sinCoords,
      fueraDePeru,
      agentesResult,
    ] = await Promise.all([
      prisma.recuperoTask.count({ where }),
      prisma.recuperoTask.count({ where: { ...where, esQuemada: true } }),
      prisma.recuperoTask.count({ where: { ...where, coordStatus: "MISSING" } }),
      prisma.recuperoTask.count({ where: { ...where, coordStatus: "OUTSIDE_PERU" } }),
      prisma.recuperoTask.groupBy({
        by: ["agenteCampo"],
        where,
      }),
    ]);

    // Count exitosas: tipoCierre = "RECUPERADO WODEN"
    const [exitosas, equiposSumResult] = await Promise.all([
      prisma.recuperoTask.count({
        where: { ...where, tipoCierre: "RECUPERADO WODEN" },
      }),
      prisma.recuperoTask.aggregate({
        where,
        _sum: { equiposRecuperados: true },
      }),
    ]);

    const totalEquipos = equiposSumResult._sum.equiposRecuperados ?? 0;
    const factorDeUso = exitosas > 0
      ? Math.round((totalEquipos / exitosas) * 10) / 10
      : 0;

    return NextResponse.json({
      total,
      exitosas,
      noExitosas: total - exitosas,
      quemadas,
      sinCoords,
      fueraDePeru,
      agentes: agentesResult.length,
      totalEquipos,
      factorDeUso,
    });
  } catch (error) {
    console.error("[RECUPERO STATS] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
