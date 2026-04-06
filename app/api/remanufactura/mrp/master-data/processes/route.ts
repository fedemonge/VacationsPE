import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const processes = await prisma.mrpSubProcess.findMany({
      orderBy: { defaultSequence: "asc" },
      include: { _count: { select: { rutaSteps: true } } },
    });
    return NextResponse.json(processes);
  } catch (error) {
    console.error("[MRP] GET processes error:", error);
    return NextResponse.json({ error: "Error al obtener procesos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { code, name, description, defaultSequence, capacityPerHour, stationCount, personnelPerStation, requiresSpecialist } = await req.json();
    if (!code || !name) return NextResponse.json({ error: "Código y nombre son requeridos" }, { status: 400 });
    const process = await prisma.mrpSubProcess.create({
      data: {
        code,
        name,
        description: description ?? null,
        defaultSequence: defaultSequence ?? 0,
        capacityPerHour: capacityPerHour ?? 0,
        stationCount: stationCount ?? 1,
        personnelPerStation: personnelPerStation ?? 1,
        requiresSpecialist: requiresSpecialist ?? false,
      },
    });
    return NextResponse.json(process, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de proceso ya existe" }, { status: 409 });
    console.error("[MRP] POST process error:", error);
    return NextResponse.json({ error: "Error al crear proceso" }, { status: 500 });
  }
}
