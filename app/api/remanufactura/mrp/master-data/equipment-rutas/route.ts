import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const equipmentId = req.nextUrl.searchParams.get("equipmentId");
    const items = await prisma.mrpEquipmentRuta.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      orderBy: { sequenceOrder: "asc" },
      include: {
        ruta: { select: { id: true, code: true, name: true, _count: { select: { steps: true } } } },
        equipment: { select: { id: true, code: true, name: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[MRP] GET equipment-rutas error:", error);
    return NextResponse.json({ error: "Error al obtener rutas de equipo" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { equipmentId, rutaId, sequenceOrder } = await req.json();
    if (!equipmentId || !rutaId || sequenceOrder === undefined) {
      return NextResponse.json({ error: "equipmentId, rutaId y sequenceOrder son requeridos" }, { status: 400 });
    }
    const item = await prisma.mrpEquipmentRuta.create({
      data: { equipmentId, rutaId, sequenceOrder },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esta ruta ya está asignada a este equipo" }, { status: 409 });
    console.error("[MRP] POST equipment-ruta error:", error);
    return NextResponse.json({ error: "Error al asignar ruta" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID es requerido" }, { status: 400 });
    await prisma.mrpEquipmentRuta.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("[MRP] DELETE equipment-ruta error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
