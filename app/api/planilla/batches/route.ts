import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/planilla/batches — List batches
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId") || "";

  const where: Record<string, unknown> = {};
  if (periodId) where.periodId = periodId;

  const batches = await prisma.payrollBatch.findMany({
    where,
    include: {
      period: {
        select: { periodYear: true, periodMonth: true, periodType: true, status: true },
      },
      _count: { select: { details: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(batches);
}

// POST /api/planilla/batches — Create a new batch from a period's non-excluded details
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { periodId, notes } = body;

  if (!periodId) {
    return NextResponse.json({ error: "periodId es requerido" }, { status: 400 });
  }

  // Verify period exists and is CALCULADO
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }
  if (period.status !== "CALCULADO") {
    return NextResponse.json(
      { error: "Solo se puede crear un lote desde un periodo CALCULADO" },
      { status: 400 }
    );
  }

  // Find all eligible details: not excluded, not in an active batch (approved/pending)
  const activeBatchStatuses = [
    "NIVEL_1_PENDIENTE", "NIVEL_2_PENDIENTE", "NIVEL_3_PENDIENTE", "APROBADO", "PAGADO",
  ];

  const eligibleDetails = await prisma.payrollDetail.findMany({
    where: {
      periodId,
      isExcluded: false,
      OR: [
        { batchId: null },
        {
          batch: {
            status: { in: ["BORRADOR", "RECHAZADO"] },
          },
        },
      ],
    },
  });

  if (eligibleDetails.length === 0) {
    return NextResponse.json(
      { error: "No hay registros elegibles para crear un lote" },
      { status: 400 }
    );
  }

  // Calculate batch number
  const maxBatch = await prisma.payrollBatch.findFirst({
    where: { periodId },
    orderBy: { batchNumber: "desc" },
    select: { batchNumber: true },
  });
  const batchNumber = (maxBatch?.batchNumber || 0) + 1;

  const totalNeto = eligibleDetails.reduce((s, d) => s + d.netoAPagar, 0);

  try {
    // Remove old BORRADOR/RECHAZADO batch links
    await prisma.payrollDetail.updateMany({
      where: {
        periodId,
        isExcluded: false,
        batch: { status: { in: ["BORRADOR", "RECHAZADO"] } },
      },
      data: { batchId: null },
    });

    // Delete empty old BORRADOR batches
    const emptyBatches = await prisma.payrollBatch.findMany({
      where: { periodId, status: { in: ["BORRADOR", "RECHAZADO"] } },
      include: { _count: { select: { details: true } } },
    });
    for (const b of emptyBatches) {
      if (b._count.details === 0) {
        await prisma.payrollBatch.delete({ where: { id: b.id } });
      }
    }

    // Create new batch
    const batch = await prisma.payrollBatch.create({
      data: {
        periodId,
        batchNumber,
        status: "BORRADOR",
        totalEmployees: eligibleDetails.length,
        totalNeto: Math.round(totalNeto * 100) / 100,
        notes: notes || null,
        createdBy: session.email,
      },
    });

    // Link details to batch
    await prisma.payrollDetail.updateMany({
      where: { id: { in: eligibleDetails.map((d) => d.id) } },
      data: { batchId: batch.id },
    });

    console.log(`[BATCHES] Created batch #${batchNumber} for period ${period.periodYear}-${period.periodMonth} with ${eligibleDetails.length} employees`);
    return NextResponse.json(batch);
  } catch (err) {
    console.error("[BATCHES] Create error:", err);
    return NextResponse.json({ error: "Error al crear lote" }, { status: 500 });
  }
}
