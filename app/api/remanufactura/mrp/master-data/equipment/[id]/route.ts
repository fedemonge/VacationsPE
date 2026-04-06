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
    const equipment = await prisma.mrpEquipment.findUnique({
      where: { id },
      include: {
        bomItems: {
          include: { material: { select: { id: true, code: true, name: true, unitOfMeasure: true } } },
          orderBy: { material: { code: 'asc' } },
        },
        equipmentRutas: {
          include: { ruta: { select: { id: true, code: true, name: true } } },
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    if (!equipment) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    return NextResponse.json(equipment);
  } catch (error) {
    console.error("[MRP] GET equipment by id error:", error);
    return NextResponse.json({ error: "Error al obtener equipo" }, { status: 500 });
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
    const { code, name, description, category, recoveryYieldPct, bomBaseQty, isActive } = await req.json();
    const equipment = await prisma.mrpEquipment.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(recoveryYieldPct !== undefined && { recoveryYieldPct }),
        ...(bomBaseQty !== undefined && { bomBaseQty }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(equipment);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de equipo ya existe" }, { status: 409 });
    console.error("[MRP] PUT equipment error:", error);
    return NextResponse.json({ error: "Error al actualizar equipo" }, { status: 500 });
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
    await prisma.mrpEquipment.delete({ where: { id } });
    return NextResponse.json({ message: "Equipo eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE equipment error:", error);
    return NextResponse.json({ error: "Error al eliminar equipo" }, { status: 500 });
  }
}
