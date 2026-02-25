import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const costCenter = searchParams.get("costCenter");
    const status = searchParams.get("status");
    const positionType = searchParams.get("positionType");

    const where: Record<string, unknown> = {};
    if (costCenter) where.costCenter = costCenter;
    if (status) where.status = status;
    if (positionType) where.positionType = positionType;

    const positions = await prisma.orgPosition.findMany({
      where,
      include: { employee: true },
      orderBy: { positionCode: "asc" },
    });

    console.log(
      `[POSICIONES] GET: ${positions.length} posiciones encontradas`
    );

    return NextResponse.json({ posiciones: positions });
  } catch (error) {
    console.error("[POSICIONES] ERROR GET:", error);
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

    if (
      !["ADMINISTRADOR", "RRHH", "GERENTE_PAIS"].includes(session.role)
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para crear posiciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      costCenter,
      costCenterDesc,
      reportsToEmail,
      employeeId,
      positionType,
      thirdPartyName,
      thirdPartyCompany,
    } = body;

    if (!title || !costCenter || !reportsToEmail) {
      return NextResponse.json(
        { error: "Título, centro de costos y supervisor son obligatorios" },
        { status: 400 }
      );
    }

    const type = positionType || "REGULAR";
    if (type === "TERCERO" && !thirdPartyName) {
      return NextResponse.json(
        { error: "El nombre del tercero es obligatorio para posiciones de terceros" },
        { status: 400 }
      );
    }

    // Generate next position code
    const lastPos = await prisma.orgPosition.findFirst({
      orderBy: { positionCode: "desc" },
    });
    const nextNum = lastPos
      ? parseInt(lastPos.positionCode.replace("POS-", "")) + 1
      : 1;
    const positionCode = `POS-${String(nextNum).padStart(4, "0")}`;

    const status = employeeId ? "OCUPADA" : "VACANTE";

    const position = await prisma.orgPosition.create({
      data: {
        positionCode,
        title,
        costCenter,
        costCenterDesc: costCenterDesc || "",
        reportsToEmail: reportsToEmail.toLowerCase(),
        employeeId: employeeId || null,
        positionType: type,
        status,
        thirdPartyName: thirdPartyName || null,
        thirdPartyCompany: thirdPartyCompany || null,
      },
    });

    console.log(
      `[POSICIONES] CREADA: ${positionCode} - ${title} por ${session.email}`
    );

    return NextResponse.json(position, { status: 201 });
  } catch (error) {
    console.error("[POSICIONES] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
