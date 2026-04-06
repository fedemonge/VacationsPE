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
    const ruta = await prisma.mrpRuta.findUnique({
      where: { id },
      include: {
        steps: {
          include: { subProcess: { select: { id: true, code: true, name: true } } },
          orderBy: { sequenceOrder: "asc" },
        },
        equipmentRutas: { include: { equipment: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!ruta) return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
    return NextResponse.json(ruta);
  } catch (error) {
    console.error("[MRP] GET ruta by id error:", error);
    return NextResponse.json({ error: "Error al obtener ruta" }, { status: 500 });
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
    const { code, name, description, isActive } = await req.json();
    const ruta = await prisma.mrpRuta.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(ruta);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de ruta ya existe" }, { status: 409 });
    console.error("[MRP] PUT ruta error:", error);
    return NextResponse.json({ error: "Error al actualizar ruta" }, { status: 500 });
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
    await prisma.mrpRuta.delete({ where: { id } });
    return NextResponse.json({ message: "Ruta eliminada" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
    console.error("[MRP] DELETE ruta error:", error);
    return NextResponse.json({ error: "Error al eliminar ruta" }, { status: 500 });
  }
}
