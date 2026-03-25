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
    const exitosas = await prisma.recuperoTask.count({
      where: { ...where, tipoCierre: "RECUPERADO WODEN" },
    });

    // Use raw SQL for equiposRecuperados (field may not exist in stale Prisma Client)
    let totalEquipos = 0;
    try {
      // Get IDs from the already-filtered Prisma count scope, then sum via raw SQL
      const ids = await prisma.recuperoTask.findMany({
        where: { ...where, tipoCierre: "RECUPERADO WODEN" },
        select: { id: true },
      });
      if (ids.length > 0) {
        // Process in chunks of 500 to avoid SQL limits
        for (let c = 0; c < ids.length; c += 500) {
          const chunk = ids.slice(c, c + 500).map(r => r.id);
          const placeholders = chunk.map(() => "?").join(",");
          const result = await prisma.$queryRawUnsafe<{ total: number }[]>(
            `SELECT COALESCE(SUM("equiposRecuperados"), 0) as total FROM "RecuperoTask" WHERE "id" IN (${placeholders})`,
            ...chunk
          );
          totalEquipos += Number(result[0]?.total) || 0;
        }
      }
    } catch {
      // Column may not exist yet
    }
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
