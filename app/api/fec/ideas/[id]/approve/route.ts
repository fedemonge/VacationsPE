import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Verify caller has ANALISTA_FINANCIERO role
    const analyst = await prisma.employee.findFirst({
      where: { email: session.email },
    });

    if (!analyst) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    const analystRole = await prisma.fecRoleAssignment.findFirst({
      where: {
        employeeId: analyst.id,
        role: "ANALISTA_FINANCIERO",
      },
    });

    if (!analystRole && session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo el analista financiero puede aprobar ideas FEC" },
        { status: 403 }
      );
    }

    const idea = await prisma.fecIdea.findUnique({
      where: { id },
    });

    if (!idea) {
      return NextResponse.json(
        { error: "Idea FEC no encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.fecIdea.update({
      where: { id },
      data: {
        analystApprovedBy: analyst.fullName,
        analystApprovedAt: new Date(),
      },
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
    });

    console.log(
      `[FEC_IDEAS] APROBADA por analista: ${updated.code} - ${analyst.fullName}`
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[FEC_IDEAS] ERROR APPROVE:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
