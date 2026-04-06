import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const { quantityPerUnit, qtyPer, parentBomItemId } = await req.json();
    const bomItem = await prisma.mrpBomItem.update({
      where: { id },
      data: {
        ...(quantityPerUnit !== undefined && { quantityPerUnit }),
        ...(qtyPer !== undefined && { qtyPer }),
        ...(parentBomItemId !== undefined && { parentBomItemId }),
      },
    });
    return NextResponse.json(bomItem);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Item de BOM no encontrado" }, { status: 404 });
    console.error("[MRP] PUT bom item error:", error);
    return NextResponse.json({ error: "Error al actualizar item de BOM" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.mrpBomItem.delete({ where: { id } });
    return NextResponse.json({ message: "Item de BOM eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Item de BOM no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE bom item error:", error);
    return NextResponse.json({ error: "Error al eliminar item de BOM" }, { status: 500 });
  }
}
