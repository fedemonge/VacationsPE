import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getIterationAnalysis,
  getIterationDetail,
  getFaultAnalysis,
  getFaultByIterationAnalysis,
  getFamilyAnalysis,
  getTransactionTypeAnalysis,
  getMonthlyDiagnostics,
  getScrapByPeriod,
  getScrapByIteration,
  getScrapByReason,
  parseFilters,
} from "@/lib/remanufactura/analysis";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const filters = parseFilters(searchParams);

    switch (type) {
      case "iterations":
        return NextResponse.json(await getIterationAnalysis(filters));

      case "iteration-detail": {
        const iter = parseInt(searchParams.get("iteracion") || "0", 10);
        if (!iter) return NextResponse.json({ error: "iteracion required" }, { status: 400 });
        return NextResponse.json(await getIterationDetail(filters, iter));
      }

      case "faults":
        return NextResponse.json(
          await getFaultAnalysis({
            ...filters,
            etapa: searchParams.get("etapa") || undefined,
          })
        );

      case "faults-by-iteration":
        return NextResponse.json(await getFaultByIterationAnalysis(filters));

      case "families":
        return NextResponse.json(await getFamilyAnalysis(filters));

      case "transaction-types":
        return NextResponse.json(await getTransactionTypeAnalysis(filters));

      case "scrap": {
        const [scrapPeriod, scrapIter, scrapReason] = await Promise.all([
          getScrapByPeriod(filters),
          getScrapByIteration(filters),
          getScrapByReason(filters),
        ]);
        return NextResponse.json({ scrapByPeriod: scrapPeriod, scrapByIteration: scrapIter, scrapByReason: scrapReason });
      }

      default: {
        const [iterations, faultsDiag, faultsRep, faultsByIteration, families, txTypes, monthlyDiag] =
          await Promise.all([
            getIterationAnalysis(filters),
            getFaultAnalysis({ ...filters, resultadoDiagnostico: "SIN_FALLA" }),
            getFaultAnalysis({ ...filters, resultadoDiagnostico: "CON_FALLA" }),
            getFaultByIterationAnalysis(filters),
            getFamilyAnalysis(filters),
            getTransactionTypeAnalysis(filters),
            getMonthlyDiagnostics(filters),
          ]);

        return NextResponse.json({
          iterations,
          faultsDiagnostico: faultsDiag,
          faultsReparacion: faultsRep,
          faultsByIteration,
          families,
          transactionTypes: txTypes,
          monthlyDiagnostics: monthlyDiag,
        });
      }
    }
  } catch (error) {
    console.error("[REMANUFACTURA ANALYSIS] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener análisis" },
      { status: 500 }
    );
  }
}
