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
    const { sequenceOrder, laborHoursPerUnit, isParallel, subProcessId } = await req.json();
    const step = await prisma.mrpRutaStep.update({
      where: { id },
      data: {
        ...(sequenceOrder !== undefined && { sequenceOrder }),
        ...(laborHoursPerUnit !== undefined && { laborHoursPerUnit }),
        ...(isParallel !== undefined && { isParallel }),
        ...(subProcessId !== undefined && { subProcessId }),
      },
    });
    return NextResponse.json(step);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Paso de ruta no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Este sub-proceso ya está en la ruta" }, { status: 409 });
    console.error("[MRP] PUT ruta-step error:", error);
    return NextResponse.json({ error: "Error al actualizar paso de ruta" }, { status: 500 });
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
    await prisma.mrpRutaStep.delete({ where: { id } });
    return NextResponse.json({ message: "Paso de ruta eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Paso de ruta no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE ruta-step error:", error);
    return NextResponse.json({ error: "Error al eliminar paso de ruta" }, { status: 500 });
  }
}
