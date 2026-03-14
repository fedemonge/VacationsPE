import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const areas = await prisma.fecArea.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ areas });
  } catch (error) {
    console.error("[FEC_AREAS] ERROR GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    // Only ADMINISTRADOR or ANALISTA_FINANCIERO can create areas
    const isAdmin = session.role === "ADMINISTRADOR";
    const isAnalyst = await prisma.fecRoleAssignment.findFirst({
      where: { employee: { email: session.email }, role: "ANALISTA_FINANCIERO" },
    });

    if (!isAdmin && !isAnalyst) {
      return NextResponse.json(
        { error: "No tiene permisos para crear áreas FEC" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "El nombre del área es obligatorio" },
        { status: 400 }
      );
    }

    const existing = await prisma.fecArea.findFirst({
      where: { name: name.trim() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un área con ese nombre" },
        { status: 400 }
      );
    }

    const area = await prisma.fecArea.create({
      data: { name: name.trim() },
    });

    console.log(`[FEC_AREAS] CREADA: ${area.id} - ${area.name}`);

    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    console.error("[FEC_AREAS] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
