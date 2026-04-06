import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const item = await prisma.mrpSupplierItem.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
      },
    });
    if (!item) return NextResponse.json({ error: "Item de proveedor no encontrado" }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    console.error("[MRP] GET supplier-item by id error:", error);
    return NextResponse.json({ error: "Error al obtener item de proveedor" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const {
      supplierId, materialId, unitOfMeasure, purchaseUnit,
      purchaseUnitQty, unitCost, moq, isPreferred, isActive,
    } = await req.json();
    const item = await prisma.mrpSupplierItem.update({
      where: { id },
      data: {
        ...(supplierId !== undefined && { supplierId }),
        ...(materialId !== undefined && { materialId }),
        ...(unitOfMeasure !== undefined && { unitOfMeasure }),
        ...(purchaseUnit !== undefined && { purchaseUnit }),
        ...(purchaseUnitQty !== undefined && { purchaseUnitQty }),
        ...(unitCost !== undefined && { unitCost }),
        ...(moq !== undefined && { moq }),
        ...(isPreferred !== undefined && { isPreferred }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Item de proveedor no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Item de proveedor ya existe" }, { status: 409 });
    console.error("[MRP] PUT supplier-item error:", error);
    return NextResponse.json({ error: "Error al actualizar item de proveedor" }, { status: 500 });
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
    await prisma.mrpSupplierItem.delete({ where: { id } });
    return NextResponse.json({ message: "Item de proveedor eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Item de proveedor no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE supplier-item error:", error);
    return NextResponse.json({ error: "Error al eliminar item de proveedor" }, { status: 500 });
  }
}
