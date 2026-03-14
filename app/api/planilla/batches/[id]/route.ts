import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, resolveUserRole } from "@/lib/auth";

// GET /api/planilla/batches/[id] — Batch detail
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const batch = await prisma.payrollBatch.findUnique({
    where: { id: params.id },
    include: {
      period: {
        select: { periodYear: true, periodMonth: true, periodType: true, status: true },
      },
      details: {
        include: {
          employee: {
            select: { id: true, fullName: true, employeeCode: true, email: true, costCenter: true },
          },
        },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }
  return NextResponse.json(batch);
}

// PATCH /api/planilla/batches/[id] — Actions: SUBMIT, APPROVE, REJECT, MARK_PAID
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { action, comments } = body;

  const batch = await prisma.payrollBatch.findUnique({
    where: { id: params.id },
    include: { period: true },
  });

  if (!batch) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const role = await resolveUserRole(session.email);

  // ── SUBMIT: BORRADOR → NIVEL_1_PENDIENTE ──────────────────────
  if (action === "SUBMIT") {
    if (batch.status !== "BORRADOR") {
      return NextResponse.json({ error: "Solo se puede enviar un lote en BORRADOR" }, { status: 400 });
    }

    const updated = await prisma.payrollBatch.update({
      where: { id: params.id },
      data: { status: "NIVEL_1_PENDIENTE", currentApprovalLevel: 1 },
    });

    console.log(`[BATCHES] Batch #${batch.batchNumber} submitted for approval by ${session.email}`);
    return NextResponse.json(updated);
  }

  // ── APPROVE: advance approval level ───────────────────────────
  if (action === "APPROVE") {
    const validStatuses = ["NIVEL_1_PENDIENTE", "NIVEL_2_PENDIENTE", "NIVEL_3_PENDIENTE"];
    if (!validStatuses.includes(batch.status)) {
      return NextResponse.json({ error: "Este lote no está pendiente de aprobación" }, { status: 400 });
    }

    const currentLevel = batch.currentApprovalLevel;

    // Validate approver
    const isAuthorized = await validatePaymentApprover(session.email, role, currentLevel);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: `No tiene permiso para aprobar en el nivel ${currentLevel}` },
        { status: 403 }
      );
    }

    // Create approval record
    await prisma.approvalRecord.create({
      data: {
        requestId: batch.id,
        requestType: "LOTE_PAGO",
        approverEmail: session.email,
        approverName: session.email,
        level: currentLevel,
        status: "APROBADO",
        decidedAt: new Date(),
        comments: comments || null,
      },
    });

    let newStatus: string;
    let newLevel: number;

    if (currentLevel < 3) {
      newLevel = currentLevel + 1;
      newStatus = `NIVEL_${newLevel}_PENDIENTE`;
    } else {
      newLevel = 3;
      newStatus = "APROBADO";
    }

    const updated = await prisma.payrollBatch.update({
      where: { id: params.id },
      data: { status: newStatus, currentApprovalLevel: newLevel },
    });

    console.log(`[BATCHES] Batch #${batch.batchNumber} approved at level ${currentLevel} by ${session.email} → ${newStatus}`);
    return NextResponse.json(updated);
  }

  // ── REJECT: any pending → RECHAZADO ───────────────────────────
  if (action === "REJECT") {
    const validStatuses = ["NIVEL_1_PENDIENTE", "NIVEL_2_PENDIENTE", "NIVEL_3_PENDIENTE"];
    if (!validStatuses.includes(batch.status)) {
      return NextResponse.json({ error: "Este lote no está pendiente de aprobación" }, { status: 400 });
    }

    const currentLevel = batch.currentApprovalLevel;
    const isAuthorized = await validatePaymentApprover(session.email, role, currentLevel);
    if (!isAuthorized) {
      return NextResponse.json({ error: "No tiene permiso para rechazar en este nivel" }, { status: 403 });
    }

    await prisma.approvalRecord.create({
      data: {
        requestId: batch.id,
        requestType: "LOTE_PAGO",
        approverEmail: session.email,
        approverName: session.email,
        level: currentLevel,
        status: "RECHAZADO",
        decidedAt: new Date(),
        comments: comments || null,
      },
    });

    // Unlink details from batch
    await prisma.payrollDetail.updateMany({
      where: { batchId: batch.id },
      data: { batchId: null },
    });

    const updated = await prisma.payrollBatch.update({
      where: { id: params.id },
      data: { status: "RECHAZADO", currentApprovalLevel: currentLevel },
    });

    console.log(`[BATCHES] Batch #${batch.batchNumber} rejected at level ${currentLevel} by ${session.email}`);
    return NextResponse.json(updated);
  }

  // ── MARK_PAID: APROBADO → PAGADO ──────────────────────────────
  if (action === "MARK_PAID") {
    if (batch.status !== "APROBADO") {
      return NextResponse.json({ error: "Solo se puede marcar como pagado un lote APROBADO" }, { status: 400 });
    }

    const updated = await prisma.payrollBatch.update({
      where: { id: params.id },
      data: { status: "PAGADO" },
    });

    console.log(`[BATCHES] Batch #${batch.batchNumber} marked as PAGADO by ${session.email}`);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// DELETE /api/planilla/batches/[id] — Delete BORRADOR batch
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const batch = await prisma.payrollBatch.findUnique({ where: { id: params.id } });
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  if (batch.status !== "BORRADOR") {
    return NextResponse.json({ error: "Solo se puede eliminar un lote en BORRADOR" }, { status: 400 });
  }

  // Unlink details
  await prisma.payrollDetail.updateMany({
    where: { batchId: batch.id },
    data: { batchId: null },
  });

  await prisma.payrollBatch.delete({ where: { id: params.id } });

  console.log(`[BATCHES] Deleted batch #${batch.batchNumber}`);
  return NextResponse.json({ ok: true });
}

// ── Validation helpers ──────────────────────────────────────────

async function validatePaymentApprover(
  email: string,
  role: string,
  level: number
): Promise<boolean> {
  if (role === "ADMINISTRADOR") return true;

  // Level 1: Analista RRHH
  if (level === 1) {
    if (role === "RRHH") return true;
    const rrhhConfig = await prisma.systemConfiguration.findUnique({
      where: { key: "ANALISTA_RRHH_EMAIL" },
    });
    return rrhhConfig?.value === email;
  }

  // Level 2: Jefe Financiero
  if (level === 2) {
    const finConfig = await prisma.systemConfiguration.findUnique({
      where: { key: "JEFE_FINANCIERO_EMAIL" },
    });
    return finConfig?.value === email;
  }

  // Level 3: Gerente General
  if (level === 3) {
    if (role === "GERENTE_PAIS") return true;
    const gerenteConfig = await prisma.systemConfiguration.findUnique({
      where: { key: "GERENTE_PAIS_EMAIL" },
    });
    return gerenteConfig?.value === email;
  }

  return false;
}
