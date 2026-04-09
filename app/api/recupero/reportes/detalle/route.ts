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
    const departamento = searchParams.get("departamento");

    if (!agenteCampo && !departamento) {
      return NextResponse.json(
        { error: "Se requiere agenteCampo o departamento" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};

    if (agenteCampo) where.agenteCampo = agenteCampo;
    if (departamento) where.departamento = departamento;

    const periodoYear = searchParams.get("periodoYear");
    const periodoMonth = searchParams.get("periodoMonth");
    const dayParam = searchParams.get("day");
    const tipoBase = searchParams.get("tipoBase");
    const grupo = searchParams.get("grupo");
    const esAgendado = searchParams.get("esAgendado");

    if (periodoYear) where.periodoYear = parseInt(periodoYear, 10);
    if (periodoMonth) where.periodoMonth = parseInt(periodoMonth, 10);
    if (dayParam) where.periodoDay = parseInt(dayParam, 10);
    if (tipoBase) where.tipoBase = tipoBase;
    if (grupo) where.grupo = { contains: grupo };
    if (esAgendado !== null && esAgendado !== undefined && esAgendado !== "") {
      where.esAgendado = esAgendado === "true";
    }

    const tasks = await prisma.recuperoTask.findMany({
      where,
      orderBy: { fechaCierre: "desc" },
      select: {
        id: true,
        agenteCampo: true,
        contrato: true,
        cedulaUsuario: true,
        nombreUsuario: true,
        direccion: true,
        ciudad: true,
        departamento: true,
        tipoBase: true,
        grupo: true,
        estado: true,
        tipoCierre: true,
        fechaCierre: true,
        distanciaMetros: true,
        equiposRecuperados: true,
        esQuemada: true,
        esAgendado: true,
        coordStatus: true,
      },
    });

    return NextResponse.json({
      total: tasks.length,
      filter: agenteCampo
        ? { type: "agente", value: agenteCampo }
        : { type: "departamento", value: departamento },
      tasks,
    });
  } catch (error) {
    console.error("[RECUPERO DETALLE] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener detalle" },
      { status: 500 }
    );
  }
}
