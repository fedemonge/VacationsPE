import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId");
    const supplierId = searchParams.get("supplierId");
    const where: any = {};
    if (materialId) where.materialId = materialId;
    if (supplierId) where.supplierId = supplierId;
    const items = await prisma.mrpSupplierItem.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { unitCost: "asc" },
      include: {
        supplier: { select: { id: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[MRP] GET supplier-items error:", error);
    return NextResponse.json({ error: "Error al obtener items de proveedor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const {
      supplierId, materialId, unitOfMeasure, purchaseUnit,
      purchaseUnitQty, unitCost, moq, isPreferred,
    } = await req.json();
    if (!supplierId || !materialId) {
      return NextResponse.json({ error: "supplierId y materialId son requeridos" }, { status: 400 });
    }
    const item = await prisma.mrpSupplierItem.create({
      data: {
        supplierId,
        materialId,
        unitOfMeasure: unitOfMeasure ?? null,
        purchaseUnit: purchaseUnit ?? null,
        purchaseUnitQty: purchaseUnitQty ?? 1,
        unitCost: unitCost ?? 0,
        moq: moq ?? 1,
        isPreferred: isPreferred ?? false,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Item de proveedor ya existe" }, { status: 409 });
    console.error("[MRP] POST supplier-item error:", error);
    return NextResponse.json({ error: "Error al crear item de proveedor" }, { status: 500 });
  }
}
