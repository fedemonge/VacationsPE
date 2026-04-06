import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const materials = await prisma.mrpMaterial.findMany({
      orderBy: { code: "asc" },
      include: {
        mainSupplier: { select: { id: true, name: true } },
        backupSupplier: { select: { id: true, name: true } },
        _count: { select: { bomItems: true, supplierItems: true } },
      },
    });
    return NextResponse.json(materials);
  } catch (error) {
    console.error("[MRP] GET materials error:", error);
    return NextResponse.json({ error: "Error al obtener materiales" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const {
      code, name, description, unitOfMeasure, unitCost, costPerQty, leadTimeDays,
      safetyStockQty, abcClass, recoveryYieldPct, isRecoverable,
      mainSupplierId, backupSupplierId,
    } = await req.json();
    if (!code || !name) {
      return NextResponse.json({ error: "Código y nombre son requeridos" }, { status: 400 });
    }
    const material = await prisma.mrpMaterial.create({
      data: {
        code,
        name,
        description: description ?? null,
        unitOfMeasure: unitOfMeasure ?? null,
        unitCost: unitCost ?? 0,
        costPerQty: costPerQty ?? 1,
        leadTimeDays: leadTimeDays ?? 0,
        safetyStockQty: safetyStockQty ?? 0,
        abcClass: abcClass ?? null,
        recoveryYieldPct: recoveryYieldPct ?? 0,
        isRecoverable: isRecoverable ?? false,
        mainSupplierId: mainSupplierId ?? null,
        backupSupplierId: backupSupplierId ?? null,
      },
    });
    return NextResponse.json(material, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de material ya existe" }, { status: 409 });
    console.error("[MRP] POST material error:", error);
    return NextResponse.json({ error: "Error al crear material" }, { status: 500 });
  }
}
