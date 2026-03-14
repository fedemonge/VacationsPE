import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const assignments = await prisma.fecUserCompanyAccess.findMany({
      include: {
        employee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("[FEC_USER_ACCESS] ERROR GET:", error);
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

    const body = await request.json();
    const { employeeId, companyId } = body;

    if (!employeeId || !companyId) {
      return NextResponse.json(
        { error: "employeeId y companyId son obligatorios" },
        { status: 400 }
      );
    }

    // Validate employee exists
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    // Validate company exists
    const company = await prisma.fecCompany.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json(
        { error: "Empresa no encontrada" },
        { status: 404 }
      );
    }

    const assignment = await prisma.fecUserCompanyAccess.create({
      data: {
        employeeId,
        companyId,
      },
      include: {
        employee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
    });

    console.log(
      `[FEC_USER_ACCESS] ACCESO OTORGADO: ${employee.fullName} -> ${company.name}`
    );

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("[FEC_USER_ACCESS] ERROR POST:", error);
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

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id es obligatorio" },
        { status: 400 }
      );
    }

    const existing = await prisma.fecUserCompanyAccess.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Asignación no encontrada" },
        { status: 404 }
      );
    }

    await prisma.fecUserCompanyAccess.delete({ where: { id } });

    console.log(`[FEC_USER_ACCESS] ACCESO REVOCADO: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FEC_USER_ACCESS] ERROR DELETE:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
