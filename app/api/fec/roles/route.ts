import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const roles = await prisma.fecRoleAssignment.findMany({
      include: {
        employee: { select: { id: true, fullName: true, email: true } },
        area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ roles });
  } catch (error) {
    console.error("[FEC_ROLES] ERROR GET:", error);
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

    if (session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo administradores pueden asignar roles FEC" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId, role, areaId } = body;

    if (!employeeId || !role) {
      return NextResponse.json(
        { error: "employeeId y role son obligatorios" },
        { status: 400 }
      );
    }

    const validRoles = ["ANALISTA_FINANCIERO", "RESPONSABLE_AREA"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Rol inválido. Roles válidos: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    if (role === "RESPONSABLE_AREA" && !areaId) {
      return NextResponse.json(
        { error: "areaId es obligatorio para el rol RESPONSABLE_AREA" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    if (areaId) {
      const area = await prisma.fecArea.findUnique({ where: { id: areaId } });
      if (!area) {
        return NextResponse.json(
          { error: "Área no encontrada" },
          { status: 404 }
        );
      }
    }

    // Check for duplicate assignment
    const existing = await prisma.fecRoleAssignment.findFirst({
      where: {
        employeeId,
        role,
        areaId: areaId || null,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Esta asignación de rol ya existe" },
        { status: 400 }
      );
    }

    const assignment = await prisma.fecRoleAssignment.create({
      data: {
        employeeId,
        role,
        areaId: role === "ANALISTA_FINANCIERO" ? null : areaId,
      },
      include: {
        employee: { select: { id: true, fullName: true, email: true } },
        area: { select: { id: true, name: true } },
      },
    });

    console.log(`[FEC_ROLES] ASIGNADO: ${employee.fullName} -> ${role}${areaId ? ` (área: ${areaId})` : ""}`);

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("[FEC_ROLES] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

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
        { error: "Solo administradores pueden eliminar roles FEC" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id es obligatorio" },
        { status: 400 }
      );
    }

    const existing = await prisma.fecRoleAssignment.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Asignación de rol no encontrada" },
        { status: 404 }
      );
    }

    await prisma.fecRoleAssignment.delete({ where: { id } });

    console.log(`[FEC_ROLES] ELIMINADO: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FEC_ROLES] ERROR DELETE:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
