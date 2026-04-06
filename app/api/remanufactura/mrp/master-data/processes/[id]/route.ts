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
    const process = await prisma.mrpSubProcess.findUnique({
      where: { id },
      include: {
        rutaSteps: {
          include: { ruta: { select: { id: true, code: true, name: true } } },
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    if (!process) return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    return NextResponse.json(process);
  } catch (error) {
    console.error("[MRP] GET process by id error:", error);
    return NextResponse.json({ error: "Error al obtener proceso" }, { status: 500 });
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
    const { code, name, description, defaultSequence, capacityPerHour, stationCount, personnelPerStation, requiresSpecialist, isActive } = await req.json();
    const process = await prisma.mrpSubProcess.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(defaultSequence !== undefined && { defaultSequence }),
        ...(capacityPerHour !== undefined && { capacityPerHour }),
        ...(stationCount !== undefined && { stationCount }),
        ...(personnelPerStation !== undefined && { personnelPerStation }),
        ...(requiresSpecialist !== undefined && { requiresSpecialist }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json(process);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Código de proceso ya existe" }, { status: 409 });
    console.error("[MRP] PUT process error:", error);
    return NextResponse.json({ error: "Error al actualizar proceso" }, { status: 500 });
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
    await prisma.mrpSubProcess.delete({ where: { id } });
    return NextResponse.json({ message: "Proceso eliminado" });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    console.error("[MRP] DELETE process error:", error);
    return NextResponse.json({ error: "Error al eliminar proceso" }, { status: 500 });
  }
}
