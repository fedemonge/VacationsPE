import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

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
  const data: Record<string, unknown> = {};

  if (body.nombre !== undefined) data.nombre = body.nombre.trim();
  if (body.latInicio !== undefined) data.latInicio = parseFloat(body.latInicio);
  if (body.lonInicio !== undefined) data.lonInicio = parseFloat(body.lonInicio);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const agente = await prisma.rutaAgente.update({
    where: { id },
    data,
  });

  return NextResponse.json(agente);
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

  await prisma.rutaAgente.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
