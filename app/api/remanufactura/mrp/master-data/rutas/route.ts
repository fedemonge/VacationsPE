import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const rutas = await prisma.mrpRuta.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: { select: { steps: true, equipmentRutas: true } },
        steps: {
          include: {
            subProcess: { select: { id: true, code: true, name: true } },
            childRuta: { select: { id: true, code: true, name: true, _count: { select: { steps: true } } } },
          },
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    return NextResponse.json(rutas);
  } catch (error) {
    console.error("[MRP] GET rutas error:", error);
    return NextResponse.json({ error: "Error al obtener rutas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { code, name, description } = await req.json();
    if (!code || !name) return NextResponse.json({ error: "Código y nombre son requeridos" }, { status: 400 });
    const ruta = await prisma.mrpRuta.create({
      data: { code, name, description: description ?? null },
    });
    return NextResponse.json(ruta, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de ruta ya existe" }, { status: 409 });
    console.error("[MRP] POST ruta error:", error);
    return NextResponse.json({ error: "Error al crear ruta" }, { status: 500 });
  }
}
