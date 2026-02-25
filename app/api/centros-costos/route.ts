import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET: list all cost centers
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const costCenters = await prisma.costCenter.findMany({
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ costCenters });
  } catch (error) {
    console.error("[CENTROS_COSTOS] GET ERROR:", error);
    return NextResponse.json(
      { error: "Error al cargar centros de costos" },
      { status: 500 }
    );
  }
}

// POST: create a new cost center
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (session.role !== "ADMINISTRADOR" && session.role !== "RRHH") {
      return NextResponse.json(
        { error: "No tiene permisos para crear centros de costos" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, description } = body;

    if (!code || !description) {
      return NextResponse.json(
        { error: "Código y descripción son obligatorios" },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim().toUpperCase();
    const trimmedDesc = description.trim();

    // Check for duplicate code
    const existing = await prisma.costCenter.findUnique({
      where: { code: trimmedCode },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Ya existe un centro de costos con el código "${trimmedCode}"` },
        { status: 409 }
      );
    }

    const costCenter = await prisma.costCenter.create({
      data: {
        code: trimmedCode,
        description: trimmedDesc,
      },
    });

    console.log(
      `[CENTROS_COSTOS] CREADO: ${costCenter.code} - ${costCenter.description} por ${session.email}`
    );

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    console.error("[CENTROS_COSTOS] POST ERROR:", error);
    return NextResponse.json(
      { error: "Error al crear centro de costos" },
      { status: 500 }
    );
  }
}

// PATCH: update a cost center
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (session.role !== "ADMINISTRADOR" && session.role !== "RRHH") {
      return NextResponse.json(
        { error: "No tiene permisos para modificar centros de costos" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, code, description } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID es obligatorio" },
        { status: 400 }
      );
    }

    const existing = await prisma.costCenter.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Centro de costos no encontrado" },
        { status: 404 }
      );
    }

    const data: { code?: string; description?: string } = {};
    if (code !== undefined) {
      const trimmedCode = code.trim().toUpperCase();
      // Check for duplicate if code is changing
      if (trimmedCode !== existing.code) {
        const dup = await prisma.costCenter.findUnique({
          where: { code: trimmedCode },
        });
        if (dup) {
          return NextResponse.json(
            { error: `Ya existe un centro de costos con el código "${trimmedCode}"` },
            { status: 409 }
          );
        }
      }
      data.code = trimmedCode;
    }
    if (description !== undefined) {
      data.description = description.trim();
    }

    const updated = await prisma.costCenter.update({
      where: { id },
      data,
    });

    console.log(
      `[CENTROS_COSTOS] ACTUALIZADO: ${updated.code} - ${updated.description} por ${session.email}`
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[CENTROS_COSTOS] PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar centro de costos" },
      { status: 500 }
    );
  }
}

// DELETE: delete a cost center
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo el administrador puede eliminar centros de costos" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID es obligatorio" },
        { status: 400 }
      );
    }

    const existing = await prisma.costCenter.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Centro de costos no encontrado" },
        { status: 404 }
      );
    }

    await prisma.costCenter.delete({ where: { id } });

    console.log(
      `[CENTROS_COSTOS] ELIMINADO: ${existing.code} por ${session.email}`
    );

    return NextResponse.json({ message: `Centro de costos "${existing.code}" eliminado.` });
  } catch (error) {
    console.error("[CENTROS_COSTOS] DELETE ERROR:", error);
    return NextResponse.json(
      { error: "Error al eliminar centro de costos" },
      { status: 500 }
    );
  }
}
