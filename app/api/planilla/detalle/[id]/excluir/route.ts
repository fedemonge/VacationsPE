import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/planilla/detalle/[id]/excluir — Exclude a payroll detail from payment
 * Body: { reason: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { reason } = body;

  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: "Debe indicar una razón para la exclusión" }, { status: 400 });
  }

  const detail = await prisma.payrollDetail.findUnique({
    where: { id: params.id },
    include: {
      period: true,
      batch: true,
    },
  });

  if (!detail) {
    return NextResponse.json({ error: "Detalle no encontrado" }, { status: 404 });
  }

  if (detail.period.status === "CERRADO") {
    return NextResponse.json({ error: "No se puede excluir de un periodo cerrado" }, { status: 400 });
  }

  if (detail.isExcluded) {
    return NextResponse.json({ error: "Este registro ya está excluido" }, { status: 400 });
  }

  // Cannot exclude if in an active batch (pending approval or approved)
  if (detail.batch && !["BORRADOR", "RECHAZADO"].includes(detail.batch.status)) {
    return NextResponse.json(
      { error: "No se puede excluir un registro que está en un lote en aprobación o aprobado" },
      { status: 400 }
    );
  }

  // Remove from BORRADOR batch if any
  const updateData: Record<string, unknown> = {
    isExcluded: true,
    exclusionReason: reason.trim(),
    excludedBy: session.email,
    excludedAt: new Date(),
    batchId: null,
  };

  const updated = await prisma.payrollDetail.update({
    where: { id: params.id },
    data: updateData,
    include: {
      employee: { select: { fullName: true, employeeCode: true } },
    },
  });

  // Update batch totals if it was in a batch
  if (detail.batchId) {
    const remainingDetails = await prisma.payrollDetail.findMany({
      where: { batchId: detail.batchId },
    });
    await prisma.payrollBatch.update({
      where: { id: detail.batchId },
      data: {
        totalEmployees: remainingDetails.length,
        totalNeto: Math.round(remainingDetails.reduce((s, d) => s + d.netoAPagar, 0) * 100) / 100,
      },
    });
  }

  console.log(`[DETALLE] Excluded: ${updated.employee.fullName} (${updated.employee.employeeCode}) - Reason: ${reason}`);
  return NextResponse.json(updated);
}
