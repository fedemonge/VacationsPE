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
    const supplier = await prisma.mrpSupplier.findUnique({
      where: { id },
      include: {
        supplierItems: {
          include: { material: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!supplier) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    return NextResponse.json(supplier);
  } catch (error) {
    console.error("[MRP] GET supplier by id error:", error);
    return NextResponse.json({ error: "Error al obtener proveedor" }, { status: 500 });
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
    const { name, contactName, email, phone, country, currency, isActive } = await req.json();
    const supplier = await prisma.mrpSupplier.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(contactName !== undefined && { contactName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(country !== undefined && { country }),
        ...(currency !== undefined && { currency }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(supplier);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Proveedor ya existe" }, { status: 409 });
    console.error("[MRP] PUT supplier error:", error);
    return NextResponse.json({ error: "Error al actualizar proveedor" }, { status: 500 });
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
    await prisma.mrpSupplier.delete({ where: { id } });
    return NextResponse.json({ message: "Proveedor eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE supplier error:", error);
    return NextResponse.json({ error: "Error al eliminar proveedor" }, { status: 500 });
  }
}
