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
    const material = await prisma.mrpMaterial.findUnique({
      where: { id },
      include: {
        mainSupplier: { select: { id: true, name: true } },
        backupSupplier: { select: { id: true, name: true } },
        supplierItems: {
          include: {
            supplier: { select: { id: true, name: true } },
          },
        },
        bomItems: {
          include: {
            equipment: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!material) return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    return NextResponse.json(material);
  } catch (error) {
    console.error("[MRP] GET material by id error:", error);
    return NextResponse.json({ error: "Error al obtener material" }, { status: 500 });
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
      code, name, description, unitOfMeasure, unitCost, costPerQty, leadTimeDays,
      safetyStockQty, abcClass, recoveryYieldPct, isRecoverable,
      isActive, mainSupplierId, backupSupplierId,
    } = await req.json();
    const material = await prisma.mrpMaterial.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(unitOfMeasure !== undefined && { unitOfMeasure }),
        ...(unitCost !== undefined && { unitCost }),
        ...(costPerQty !== undefined && { costPerQty }),
        ...(leadTimeDays !== undefined && { leadTimeDays }),
        ...(safetyStockQty !== undefined && { safetyStockQty }),
        ...(abcClass !== undefined && { abcClass }),
        ...(recoveryYieldPct !== undefined && { recoveryYieldPct }),
        ...(isRecoverable !== undefined && { isRecoverable }),
        ...(isActive !== undefined && { isActive }),
        ...(mainSupplierId !== undefined && { mainSupplierId }),
        ...(backupSupplierId !== undefined && { backupSupplierId }),
      },
    });
    return NextResponse.json(material);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de material ya existe" }, { status: 409 });
    console.error("[MRP] PUT material error:", error);
    return NextResponse.json({ error: "Error al actualizar material" }, { status: 500 });
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
    await prisma.mrpMaterial.delete({ where: { id } });
    return NextResponse.json({ message: "Material eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE material error:", error);
    return NextResponse.json({ error: "Error al eliminar material" }, { status: 500 });
  }
}
