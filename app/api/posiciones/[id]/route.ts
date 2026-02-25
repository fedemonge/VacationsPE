import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const { id } = params;
    const position = await prisma.orgPosition.findUnique({
      where: { id },
      include: {
        employee: true,
        staffRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: "Posición no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(position);
  } catch (error) {
    console.error("[POSICIONES] ERROR GET ID:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (
      !["ADMINISTRADOR", "RRHH", "GERENTE_PAIS"].includes(session.role)
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para modificar posiciones" },
        { status: 403 }
      );
    }

    const { id } = params;
    const existing = await prisma.orgPosition.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Posición no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.costCenter !== undefined) data.costCenter = body.costCenter;
    if (body.costCenterDesc !== undefined) data.costCenterDesc = body.costCenterDesc;
    if (body.reportsToEmail !== undefined)
      data.reportsToEmail = body.reportsToEmail.toLowerCase();
    if (body.positionType !== undefined) data.positionType = body.positionType;
    if (body.thirdPartyName !== undefined) data.thirdPartyName = body.thirdPartyName;
    if (body.thirdPartyCompany !== undefined)
      data.thirdPartyCompany = body.thirdPartyCompany;

    // Handle employeeId changes — auto-toggle status
    if (body.employeeId !== undefined) {
      data.employeeId = body.employeeId || null;
      if (body.employeeId) {
        data.status = "OCUPADA";
      } else {
        data.status = "VACANTE";
      }
    }

    if (body.status !== undefined && body.employeeId === undefined) {
      data.status = body.status;
    }

    const updated = await prisma.orgPosition.update({
      where: { id },
      data,
    });

    console.log(
      `[POSICIONES] ACTUALIZADA: ${updated.positionCode} por ${session.email}`
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[POSICIONES] ERROR PATCH:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
