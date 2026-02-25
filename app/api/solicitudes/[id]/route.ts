import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const solicitud = await prisma.vacationRequest.findUnique({
    where: { id: params.id },
    include: {
      employee: true,
      vacationConsumptions: { include: { accrual: true } },
    },
  });

  if (!solicitud) {
    return NextResponse.json(
      { error: "Solicitud no encontrada" },
      { status: 404 }
    );
  }

  const approvalRecords = await prisma.approvalRecord.findMany({
    where: { requestId: params.id },
    orderBy: { level: "asc" },
  });

  return NextResponse.json({ ...solicitud, approvalRecords });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status, cancelReason } = body;

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (cancelReason) {
      updateData.cancelReason = cancelReason;
      updateData.cancelledAt = new Date();
    }

    const solicitud = await prisma.vacationRequest.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(solicitud);
  } catch (error) {
    console.error("[SOLICITUD] UPDATE ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar la solicitud" },
      { status: 500 }
    );
  }
}
