import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { runId } = await params;

  try {
    const run = await prisma.mrpRun.findUnique({
      where: { id: runId },
      include: {
        purchasePlans: {
          include: {
            material: {
              select: {
                id: true, code: true, name: true,
                mainSupplier: { select: { id: true, name: true } },
                backupSupplier: { select: { id: true, name: true } },
              },
            },
            supplierItem: {
              include: {
                supplier: {
                  select: { id: true, name: true, country: true, currency: true },
                },
              },
            },
          },
        },
        productionPlans: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, category: true },
            },
            subProcess: {
              select: { id: true, code: true, name: true, requiresSpecialist: true },
            },
            shift: {
              select: { id: true, name: true, startTime: true, endTime: true },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Corrida MRP no encontrada" }, { status: 404 });
    }

    const totalPurchaseCost = run.purchasePlans.reduce((sum, p) => sum + p.totalCost, 0);
    const totalLaborHours = run.productionPlans.reduce((sum, p) => sum + p.laborHoursRequired, 0);
    const totalHeadcount = run.productionPlans.reduce((sum, p) => sum + p.headcountRequired, 0);

    return NextResponse.json({
      ...run,
      summary: {
        totalPurchaseCost,
        totalLaborHours,
        totalHeadcount,
        purchaseLineItems: run.purchasePlans.length,
        productionLineItems: run.productionPlans.length,
      },
    });
  } catch (error) {
    console.error("[MRP] Get run error:", error);
    return NextResponse.json({ error: "Error al obtener corrida MRP" }, { status: 500 });
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
};

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { runId } = await params;

  try {
    const { status } = await req.json();
    if (!status) {
      return NextResponse.json({ error: "Estado es requerido" }, { status: 400 });
    }

    const run = await prisma.mrpRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: "Corrida MRP no encontrada" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[run.status];
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json(
        { error: `Transición no permitida: ${run.status} → ${status}. Transiciones válidas desde ${run.status}: ${(allowed || []).join(", ") || "ninguna"}` },
        { status: 400 }
      );
    }

    const updated = await prisma.mrpRun.update({
      where: { id: runId },
      data: { status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[MRP] Update run error:", error);
    return NextResponse.json({ error: "Error al actualizar corrida MRP" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { runId } = await params;

  try {
    const run = await prisma.mrpRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: "Corrida MRP no encontrada" }, { status: 404 });
    }

    await prisma.mrpRun.delete({ where: { id: runId } });

    return NextResponse.json({ message: "Corrida MRP eliminada correctamente" });
  } catch (error) {
    console.error("[MRP] Delete run error:", error);
    return NextResponse.json({ error: "Error al eliminar corrida MRP" }, { status: 500 });
  }
}
