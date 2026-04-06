import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const equipment = await prisma.mrpEquipment.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: { select: { bomItems: true } },
        equipmentRutas: {
          include: { ruta: { select: { id: true, code: true, name: true } } },
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    return NextResponse.json(equipment);
  } catch (error) {
    console.error("[MRP] GET equipment error:", error);
    return NextResponse.json({ error: "Error al obtener equipos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { code, name, description, category, recoveryYieldPct, bomBaseQty } = await req.json();
    if (!code || !name) return NextResponse.json({ error: "Código y nombre son requeridos" }, { status: 400 });
    const equipment = await prisma.mrpEquipment.create({
      data: { code, name, description: description ?? null, category: category ?? null, recoveryYieldPct: recoveryYieldPct ?? 0, bomBaseQty: bomBaseQty ?? 1 },
    });
    return NextResponse.json(equipment, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de equipo ya existe" }, { status: 409 });
    console.error("[MRP] POST equipment error:", error);
    return NextResponse.json({ error: "Error al crear equipo" }, { status: 500 });
  }
}
