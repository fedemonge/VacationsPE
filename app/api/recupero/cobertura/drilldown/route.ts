import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/recupero/cobertura/drilldown?customerId=83770811
 * Returns all visit records for a specific customer (cedulaUsuario).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const customerId = req.nextUrl.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "customerId requerido" }, { status: 400 });

  const tasks = await prisma.recuperoTask.findMany({
    where: {
      OR: [
        { cedulaUsuario: customerId },
        { contrato: customerId },
      ],
    },
    select: {
      id: true,
      externalId: true,
      contrato: true,
      cedulaUsuario: true,
      nombreUsuario: true,
      direccion: true,
      departamento: true,
      ciudad: true,
      agenteCampo: true,
      fechaCierre: true,
      tipoCierre: true,
      tipoBase: true,
      esQuemada: true,
      distanciaMetros: true,
      equiposRecuperados: true,
      tarea: true,
      import: { select: { fileName: true, createdAt: true } },
    },
    orderBy: { fechaCierre: "asc" },
  });

  return NextResponse.json(tasks);
}
