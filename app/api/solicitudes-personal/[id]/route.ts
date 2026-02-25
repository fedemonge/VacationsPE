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
    const staffRequest = await prisma.staffRequest.findUnique({
      where: { id },
      include: {
        position: true,
        hiredEmployee: true,
      },
    });

    if (!staffRequest) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const approvalRecords = await prisma.approvalRecord.findMany({
      where: { requestId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      ...staffRequest,
      approvalRecords,
    });
  } catch (error) {
    console.error("[SOLICITUD_PERSONAL] ERROR GET ID:", error);
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

    if (!["ADMINISTRADOR", "RRHH"].includes(session.role)) {
      return NextResponse.json(
        { error: "No tiene permisos para modificar solicitudes de personal" },
        { status: 403 }
      );
    }

    const { id } = params;
    const existing = await prisma.staffRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    // Mark hire completion
    if (body.hiredEmployeeId && body.hiredAt) {
      if (existing.status !== "APROBADA") {
        return NextResponse.json(
          { error: "Solo se puede registrar contratación en solicitudes aprobadas" },
          { status: 400 }
        );
      }

      data.hiredEmployeeId = body.hiredEmployeeId;
      data.hiredAt = new Date(body.hiredAt);

      // If the request is linked to a position, mark it as OCUPADA
      if (existing.positionId) {
        await prisma.orgPosition.update({
          where: { id: existing.positionId },
          data: {
            employeeId: body.hiredEmployeeId,
            status: "OCUPADA",
          },
        });

        console.log(
          `[POSICIONES] OCUPADA: posición ${existing.positionId} asignada a empleado ${body.hiredEmployeeId}`
        );
      }

      console.log(
        `[SOLICITUD_PERSONAL] CONTRATACION COMPLETADA: ${id} - empleado ${body.hiredEmployeeId}`
      );
    }

    // Cancellation
    if (body.status === "CANCELADA") {
      if (existing.status === "APROBADA" || existing.status === "RECHAZADA") {
        return NextResponse.json(
          { error: "No se puede cancelar una solicitud ya finalizada" },
          { status: 400 }
        );
      }
      data.status = "CANCELADA";
      data.cancelledAt = new Date();
      data.cancelReason = body.cancelReason || "";

      console.log(
        `[SOLICITUD_PERSONAL] CANCELADA: ${id} por ${session.email}`
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No hay cambios para aplicar" },
        { status: 400 }
      );
    }

    const updated = await prisma.staffRequest.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[SOLICITUD_PERSONAL] ERROR PATCH:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
