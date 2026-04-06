import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    // Base counts
    const [equipmentCount, materialCount, supplierCount, latestRun] = await Promise.all([
      prisma.mrpEquipment.count({ where: { isActive: true } }),
      prisma.mrpMaterial.count(),
      prisma.mrpSupplier.count({ where: { isActive: true } }),
      prisma.mrpRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          startMonth: true,
          startYear: true,
          horizonMonths: true,
          status: true,
          createdAt: true,
          createdByEmail: true,
        },
      }),
    ]);

    // Demand aggregated by month/year
    const demandByMonth = await prisma.mrpDemandForecast.groupBy({
      by: ["month", "year"],
      _sum: { quantity: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const dashboard: Record<string, any> = {
      equipmentCount,
      materialCount,
      supplierCount,
      latestRun,
      demandByMonth: demandByMonth.map((d) => ({
        month: d.month,
        year: d.year,
        totalQuantity: d._sum.quantity ?? 0,
      })),
    };

    // If there is a latest run, add production and headcount breakdowns
    if (latestRun) {
      const [productionByMonth, headcountByMonth, purchasePlans] = await Promise.all([
        prisma.mrpProductionPlan.groupBy({
          by: ["month", "year"],
          where: { mrpRunId: latestRun.id },
          _sum: { unitsToProcess: true, laborHoursRequired: true },
          orderBy: [{ year: "asc" }, { month: "asc" }],
        }),
        prisma.mrpProductionPlan.groupBy({
          by: ["month", "year", "isSpecialist"],
          where: { mrpRunId: latestRun.id },
          _sum: { headcountRequired: true },
          orderBy: [{ year: "asc" }, { month: "asc" }],
        }),
        prisma.mrpPurchasePlan.findMany({
          where: { mrpRunId: latestRun.id },
          include: {
            material: { select: { code: true, name: true } },
          },
        }),
      ]);

      dashboard.productionByMonth = productionByMonth.map((p) => ({
        month: p.month,
        year: p.year,
        totalUnits: p._sum.unitsToProcess ?? 0,
        totalLaborHours: p._sum.laborHoursRequired ?? 0,
      }));

      // Group headcount: general vs specialist
      const headcountMap: Record<string, { general: number; specialist: number }> = {};
      for (const h of headcountByMonth) {
        const key = `${h.month}-${h.year}`;
        if (!headcountMap[key]) headcountMap[key] = { general: 0, specialist: 0 };
        if (h.isSpecialist) {
          headcountMap[key].specialist += h._sum.headcountRequired ?? 0;
        } else {
          headcountMap[key].general += h._sum.headcountRequired ?? 0;
        }
      }
      dashboard.headcountByMonth = Object.entries(headcountMap).map(([key, val]) => {
        const [month, year] = key.split("-").map(Number);
        return { month, year, general: val.general, specialist: val.specialist };
      });

      // Alerts from the latest run's purchase plans
      const alerts: Array<{ type: string; severity: string; message: string }> = [];

      for (const pp of purchasePlans) {
        if (alerts.length >= 10) break;

        if (pp.totalCost > 10000) {
          alerts.push({
            type: "HIGH_COST",
            severity: "warning",
            message: `Costo alto de compra: ${pp.material.name} (${pp.material.code}) - $${pp.totalCost.toFixed(2)} en ${pp.month}/${pp.year}`,
          });
        }

        if (pp.quantityRecovered === 0 && pp.quantityNeeded > 0) {
          if (alerts.length < 10) {
            alerts.push({
              type: "NO_RECOVERY",
              severity: "warning",
              message: `Sin recuperación: ${pp.material.name} (${pp.material.code}) - ${pp.quantityNeeded} unidades necesarias sin recuperación en ${pp.month}/${pp.year}`,
            });
          }
        }
      }

      // Check headcount alerts
      for (const [key, val] of Object.entries(headcountMap)) {
        if (alerts.length >= 10) break;
        const total = val.general + val.specialist;
        if (total > 20) {
          const [month, year] = key.split("-").map(Number);
          alerts.push({
            type: "HIGH_HEADCOUNT",
            severity: "warning",
            message: `Personal elevado: ${total} personas requeridas en ${month}/${year} (${val.general} generales, ${val.specialist} especialistas)`,
          });
        }
      }

      dashboard.alerts = alerts;
    }

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[MRP] Dashboard error:", error);
    return NextResponse.json({ error: "Error al obtener dashboard MRP" }, { status: 500 });
  }
}
