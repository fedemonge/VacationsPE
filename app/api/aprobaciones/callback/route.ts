import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeVacationDaysFIFO } from "@/lib/balance/consumption";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, level, status, approverEmail, approverName, comments, decidedAt } = body;

    if (!requestId || !level || !status || !approverEmail || !approverName) {
      return NextResponse.json(
        { error: "Campos obligatorios faltantes" },
        { status: 400 }
      );
    }

    // Record the approval decision
    await prisma.approvalRecord.create({
      data: {
        requestId,
        requestType: "VACACIONES",
        approverEmail,
        approverName,
        level,
        status,
        decidedAt: decidedAt ? new Date(decidedAt) : new Date(),
        comments,
      },
    });

    const solicitud = await prisma.vacationRequest.findUnique({
      where: { id: requestId },
    });

    if (!solicitud) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    if (status === "RECHAZADO") {
      // Rejected at any level
      await prisma.vacationRequest.update({
        where: { id: requestId },
        data: { status: "RECHAZADA" },
      });
      console.log(`[APROBACION] RECHAZADA: ${requestId} en nivel ${level} por ${approverName}`);
    } else if (status === "APROBADO") {
      if (level < 3) {
        // Move to next level
        const nextLevel = level + 1;
        const nextStatus = `NIVEL_${nextLevel}_PENDIENTE`;
        await prisma.vacationRequest.update({
          where: { id: requestId },
          data: { status: nextStatus, currentApprovalLevel: nextLevel },
        });
        console.log(`[APROBACION] NIVEL ${level} APROBADO: ${requestId} → nivel ${nextLevel}`);
      } else {
        // Final approval (level 3) - consume vacation days FIFO
        await prisma.vacationRequest.update({
          where: { id: requestId },
          data: { status: "APROBADA", currentApprovalLevel: 3 },
        });

        const result = await consumeVacationDaysFIFO(
          solicitud.employeeId,
          requestId,
          solicitud.totalDays
        );

        console.log(
          `[APROBACION] APROBADA FINAL: ${requestId} - ${solicitud.totalDays} días consumidos FIFO`,
          result.consumptions
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[APROBACION] CALLBACK ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar la aprobación" },
      { status: 500 }
    );
  }
}
