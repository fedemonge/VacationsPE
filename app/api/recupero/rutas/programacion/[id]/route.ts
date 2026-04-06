import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;

  const ruta = await prisma.rutaProgramacion.findUnique({
    where: { id },
    include: {
      agente: true,
      paradas: {
        orderBy: { secuencia: "asc" },
      },
    },
  });

  if (!ruta) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  return NextResponse.json(ruta);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;
  const body = await req.json();
  const { status } = body as { status: string };

  const validStatuses = ["GENERADA", "CONFIRMADA", "EJECUTADA"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Status inválido. Valores permitidos: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const ruta = await prisma.rutaProgramacion.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json(ruta);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;

  // Delete paradas first (cascade should handle, but be explicit)
  await prisma.rutaParada.deleteMany({ where: { rutaId: id } });
  await prisma.rutaProgramacion.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
