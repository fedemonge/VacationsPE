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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build where clause
    const where: Record<string, unknown> = {};

    if (periodoYear) where.periodoYear = parseInt(periodoYear, 10);
    if (periodoMonth) where.periodoMonth = parseInt(periodoMonth, 10);
    const day = searchParams.get("day");
    if (day) where.periodoDay = parseInt(day, 10);
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

    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      prisma.recuperoTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fechaCierre: "desc" },
      }),
      prisma.recuperoTask.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[RECUPERO LIST] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener tareas" },
      { status: 500 }
    );
  }
}
