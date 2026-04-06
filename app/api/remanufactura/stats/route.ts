import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRemanufacturaStats, getFilterOptions, parseFilters } from "@/lib/remanufactura/analysis";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    // If requesting filter options
    if (searchParams.get("type") === "filter-options") {
      const options = await getFilterOptions();
      return NextResponse.json(options);
    }

    const filters = parseFilters(searchParams);
    const stats = await getRemanufacturaStats(filters);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[REMANUFACTURA STATS] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
