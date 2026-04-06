import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runMrpCalculation } from "@/lib/remanufactura/mrp";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const runs = await prisma.mrpRun.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            purchasePlans: true,
            productionPlans: true,
          },
        },
      },
    });

    const data = runs.map((run) => ({
      id: run.id,
      name: run.name,
      startMonth: run.startMonth,
      startYear: run.startYear,
      horizonMonths: run.horizonMonths,
      status: run.status,
      notes: run.notes,
      createdAt: run.createdAt,
      createdByEmail: run.createdByEmail,
      purchasePlanCount: run._count.purchasePlans,
      productionPlanCount: run._count.productionPlans,
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("[MRP] List runs error:", error);
    return NextResponse.json({ error: "Error al listar corridas MRP" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, startMonth, startYear, horizonMonths, notes } = body;

    if (!name || !startMonth || !startYear) {
      return NextResponse.json({ error: "Nombre, mes y año de inicio son requeridos" }, { status: 400 });
    }

    if (startMonth < 1 || startMonth > 12) {
      return NextResponse.json({ error: "Mes de inicio inválido (1-12)" }, { status: 400 });
    }

    if (startYear < 2020 || startYear > 2100) {
      return NextResponse.json({ error: "Año de inicio inválido" }, { status: 400 });
    }

    const horizon = horizonMonths ?? 12;

    // Run MRP calculation
    const result = await runMrpCalculation({
      startMonth,
      startYear,
      horizonMonths: horizon,
    });

    // Create the MRP run record
    const mrpRun = await prisma.mrpRun.create({
      data: {
        name,
        startMonth,
        startYear,
        horizonMonths: horizon,
        status: "DRAFT",
        notes: notes ?? null,
        createdByEmail: session.email,
      },
    });

    // Bulk create purchase plans
    if (result.purchasePlans.length > 0) {
      await prisma.mrpPurchasePlan.createMany({
        data: result.purchasePlans.map((item) => ({
          mrpRunId: mrpRun.id,
          materialId: item.materialId,
          month: item.month,
          year: item.year,
          inventoryInitial: item.inventoryInitial,
          quantityNeeded: item.quantityNeeded,
          quantityRecovered: item.quantityRecovered,
          quantityToPurchase: item.quantityToPurchase,
          inventoryFinal: item.inventoryFinal,
          productionOutput: item.productionOutput,
          orderDate: item.orderDate,
          deliveryDate: item.deliveryDate,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          supplierItemId: item.supplierItemId?.startsWith("synth-") ? null : (item.supplierItemId ?? null),
        })),
      });
    }

    // Bulk create production plans
    if (result.productionPlans.length > 0) {
      await prisma.mrpProductionPlan.createMany({
        data: result.productionPlans.map((item) => ({
          mrpRunId: mrpRun.id,
          equipmentId: item.equipmentId,
          subProcessId: item.subProcessId,
          month: item.month,
          year: item.year,
          unitsToProcess: item.unitsToProcess,
          laborHoursRequired: item.laborHoursRequired,
          headcountRequired: item.headcountRequired,
          isSpecialist: item.isSpecialist,
          shiftId: item.shiftId ?? null,
        })),
      });
    }

    // Return the run with summary
    const totalPurchaseCost = result.purchasePlans.reduce((sum, p) => sum + p.totalCost, 0);
    const totalLaborHours = result.productionPlans.reduce((sum, p) => sum + p.laborHoursRequired, 0);
    const totalHeadcount = result.productionPlans.reduce((sum, p) => sum + p.headcountRequired, 0);

    return NextResponse.json({
      run: {
        id: mrpRun.id,
        name: mrpRun.name,
        startMonth: mrpRun.startMonth,
        startYear: mrpRun.startYear,
        horizonMonths: mrpRun.horizonMonths,
        status: mrpRun.status,
        notes: mrpRun.notes,
        createdAt: mrpRun.createdAt,
        createdByEmail: mrpRun.createdByEmail,
      },
      summary: {
        totalPurchaseCost,
        totalLaborHours,
        totalHeadcount,
        purchaseLineItems: result.purchasePlans.length,
        productionLineItems: result.productionPlans.length,
      },
      alerts: result.alerts,
    });
  } catch (error) {
    console.error("[MRP] Run error:", error);
    return NextResponse.json({ error: "Error al ejecutar corrida MRP" }, { status: 500 });
  }
}
