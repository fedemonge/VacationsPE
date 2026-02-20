import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reverseConsumption } from "@/lib/balance/consumption";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, reason } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: "ID de solicitud es obligatorio" },
        { status: 400 }
      );
    }

    const solicitud = await prisma.vacationRequest.findUnique({
      where: { id: requestId },
      include: { vacationConsumptions: true },
    });

    if (!solicitud) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    // Can only withdraw requests that haven't started yet
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(solicitud.dateFrom);
    startDate.setHours(0, 0, 0, 0);

    if (startDate <= today) {
      return NextResponse.json(
        { error: "No se puede retirar una solicitud cuyo periodo ya ha comenzado" },
        { status: 400 }
      );
    }

    // Can only withdraw non-cancelled, non-rejected requests
    if (["CANCELADA", "RECHAZADA"].includes(solicitud.status)) {
      return NextResponse.json(
        { error: "Esta solicitud ya fue cancelada o rechazada" },
        { status: 400 }
      );
    }

    // Reverse FIFO consumption if there were any (happens when status is APROBADA)
    if (solicitud.vacationConsumptions.length > 0) {
      await reverseConsumption(requestId);
      console.log(
        `[SOLICITUD] CONSUMO_REVERTIDO: ${requestId} - ${solicitud.vacationConsumptions.length} registros`
      );
    }

    // Update status to CANCELADA
    const updated = await prisma.vacationRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELADA",
        cancelledAt: new Date(),
        cancelReason: reason || "Retirada voluntaria por el solicitante",
      },
    });

    console.log(
      `[SOLICITUD] RETIRADA: ${requestId} - ${solicitud.employeeName} - ${solicitud.totalDays} días (${solicitud.dateFrom.toISOString().split("T")[0]} a ${solicitud.dateTo.toISOString().split("T")[0]})`
    );

    return NextResponse.json({
      message: "Solicitud retirada exitosamente. El saldo ha sido restaurado.",
      solicitud: updated,
    });
  } catch (error) {
    console.error("[SOLICITUD] ERROR_RETIRO:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
