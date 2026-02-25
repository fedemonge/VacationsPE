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
    const status = searchParams.get("status");
    const requestType = searchParams.get("requestType");
    const costCenter = searchParams.get("costCenter");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (requestType) where.requestType = requestType;
    if (costCenter) where.costCenter = costCenter;

    const requests = await prisma.staffRequest.findMany({
      where,
      include: {
        position: true,
        hiredEmployee: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch approval records for each request
    const requestIds = requests.map((r) => r.id);
    const approvalRecords = await prisma.approvalRecord.findMany({
      where: { requestId: { in: requestIds } },
      orderBy: { createdAt: "asc" },
    });

    const approvalsByRequest = new Map<
      string,
      typeof approvalRecords
    >();
    for (const record of approvalRecords) {
      if (!approvalsByRequest.has(record.requestId)) {
        approvalsByRequest.set(record.requestId, []);
      }
      approvalsByRequest.get(record.requestId)!.push(record);
    }

    const enriched = requests.map((r) => ({
      ...r,
      approvalRecords: approvalsByRequest.get(r.id) || [],
    }));

    console.log(
      `[SOLICITUD_PERSONAL] GET: ${requests.length} solicitudes encontradas`
    );

    return NextResponse.json({ solicitudes: enriched });
  } catch (error) {
    console.error("[SOLICITUD_PERSONAL] ERROR GET:", error);
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
      !["ADMINISTRADOR", "SUPERVISOR", "RRHH", "GERENTE_PAIS"].includes(
        session.role
      )
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para crear solicitudes de personal" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      requestType,
      positionId,
      positionTitle,
      costCenter,
      costCenterDesc,
      reportsToEmail,
      positionType,
      justification,
    } = body;

    if (!requestType || !positionTitle || !costCenter || !reportsToEmail || !justification) {
      return NextResponse.json(
        { error: "Todos los campos obligatorios deben completarse" },
        { status: 400 }
      );
    }

    if (!["NUEVA_POSICION", "CONTRATACION"].includes(requestType)) {
      return NextResponse.json(
        { error: "Tipo de solicitud inválido" },
        { status: 400 }
      );
    }

    // For CONTRATACION, validate position exists and is VACANTE
    if (requestType === "CONTRATACION") {
      if (!positionId) {
        return NextResponse.json(
          { error: "Debe seleccionar una posición vacante para contratación" },
          { status: 400 }
        );
      }
      const pos = await prisma.orgPosition.findUnique({
        where: { id: positionId },
      });
      if (!pos) {
        return NextResponse.json(
          { error: "La posición seleccionada no existe" },
          { status: 404 }
        );
      }
      if (pos.status !== "VACANTE") {
        return NextResponse.json(
          { error: "La posición seleccionada ya no está vacante" },
          { status: 400 }
        );
      }
    }

    // Look up the requester's employee record for supervisor info
    const requester = await prisma.employee.findUnique({
      where: { email: session.email.toLowerCase() },
    });

    let supervisorName = "";
    let supervisorEmail = "";

    if (requester) {
      supervisorName = requester.supervisorName;
      supervisorEmail = requester.supervisorEmail;
    } else {
      // If requester is not an employee (e.g., admin), use reportsToEmail as supervisor
      supervisorEmail = reportsToEmail;
      const supervisor = await prisma.employee.findUnique({
        where: { email: reportsToEmail.toLowerCase() },
      });
      supervisorName = supervisor ? supervisor.fullName : reportsToEmail;
    }

    const staffRequest = await prisma.staffRequest.create({
      data: {
        requestType,
        positionId: positionId || null,
        positionTitle,
        costCenter,
        costCenterDesc: costCenterDesc || "",
        reportsToEmail: reportsToEmail.toLowerCase(),
        positionType: positionType || "REGULAR",
        justification,
        requestedByEmail: session.email.toLowerCase(),
        requestedByName: requester ? requester.fullName : session.email,
        supervisorName,
        supervisorEmail: supervisorEmail.toLowerCase(),
        status: "NIVEL_1_PENDIENTE",
        currentApprovalLevel: 1,
      },
    });

    // Create initial approval record
    await prisma.approvalRecord.create({
      data: {
        requestId: staffRequest.id,
        requestType: requestType,
        approverEmail: supervisorEmail.toLowerCase(),
        approverName: supervisorName,
        level: 1,
        status: "PENDIENTE",
      },
    });

    console.log(
      `[SOLICITUD_PERSONAL] CREADA: ${staffRequest.id} - ${requestType} - ${positionTitle} por ${session.email}`
    );

    return NextResponse.json(staffRequest, { status: 201 });
  } catch (error) {
    console.error("[SOLICITUD_PERSONAL] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
