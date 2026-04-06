import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const uoms = await prisma.mrpUnitOfMeasure.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(uoms);
  } catch (error) {
    console.error("[MRP] GET uom error:", error);
    return NextResponse.json({ error: "Error al obtener unidades de medida" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { code, name, abbreviation } = await req.json();
    if (!code || !name || !abbreviation) {
      return NextResponse.json({ error: "Código, nombre y abreviatura son requeridos" }, { status: 400 });
    }
    const uom = await prisma.mrpUnitOfMeasure.create({
      data: { code, name, abbreviation },
    });
    return NextResponse.json(uom, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Código ya existe" }, { status: 409 });
    console.error("[MRP] POST uom error:", error);
    return NextResponse.json({ error: "Error al crear unidad de medida" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id, code, name, abbreviation, isActive } = await req.json();
    if (!id) return NextResponse.json({ error: "ID es requerido" }, { status: 400 });
    const uom = await prisma.mrpUnitOfMeasure.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(abbreviation !== undefined && { abbreviation }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(uom);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Código ya existe" }, { status: 409 });
    console.error("[MRP] PUT uom error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID es requerido" }, { status: 400 });
    await prisma.mrpUnitOfMeasure.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("[MRP] DELETE uom error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
