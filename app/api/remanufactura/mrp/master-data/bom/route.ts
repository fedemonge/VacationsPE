import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const equipmentId = searchParams.get("equipmentId");
    const where: any = {};
    if (equipmentId) where.equipmentId = equipmentId;
    const bomItems = await prisma.mrpBomItem.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        material: { select: { id: true, code: true, name: true, unitOfMeasure: true } },
        childEquipment: { select: { id: true, code: true, name: true } },
        equipment: { select: { id: true, code: true, name: true } },
        parentBomItem: { select: { id: true } },
      },
    });
    return NextResponse.json(bomItems);
  } catch (error) {
    console.error("[MRP] GET bom items error:", error);
    return NextResponse.json({ error: "Error al obtener items de BOM" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { equipmentId, materialId, childEquipmentId, quantityPerUnit, qtyPer, parentBomItemId } = await req.json();
    if (!equipmentId) {
      return NextResponse.json({ error: "equipmentId es requerido" }, { status: 400 });
    }
    if (!materialId && !childEquipmentId) {
      return NextResponse.json({ error: "Debe especificar un material o un sub-ensamble" }, { status: 400 });
    }
    if (childEquipmentId === equipmentId) {
      return NextResponse.json({ error: "Un equipo no puede ser sub-ensamble de sí mismo" }, { status: 400 });
    }
    const bomItem = await prisma.mrpBomItem.create({
      data: {
        equipmentId,
        materialId: materialId || null,
        childEquipmentId: childEquipmentId || null,
        quantityPerUnit: quantityPerUnit ?? 1,
        qtyPer: qtyPer ?? 1,
        parentBomItemId: parentBomItemId ?? null,
      },
    });
    return NextResponse.json(bomItem, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Item de BOM ya existe para este equipo y material" }, { status: 409 });
    if (error?.code === "P2003") return NextResponse.json({ error: "Referencia no encontrada (equipo, material o item padre no existe)" }, { status: 400 });
    console.error("[MRP] POST bom item error:", error);
    return NextResponse.json({ error: "Error al crear item de BOM" }, { status: 500 });
  }
}
