import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const sp = req.nextUrl.searchParams;
  const activeOnly = sp.get("active") === "true";

  const agentes = await prisma.rutaAgente.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(agentes);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const body = await req.json();
  const { nombre, latInicio, lonInicio } = body;

  if (!nombre || latInicio == null || lonInicio == null) {
    return NextResponse.json(
      { error: "Se requiere nombre, latInicio y lonInicio" },
      { status: 400 }
    );
  }

  const agente = await prisma.rutaAgente.create({
    data: {
      nombre: nombre.trim(),
      latInicio: parseFloat(latInicio),
      lonInicio: parseFloat(lonInicio),
    },
  });

  return NextResponse.json(agente, { status: 201 });
}
