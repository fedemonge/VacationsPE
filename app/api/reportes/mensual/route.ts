import { NextRequest, NextResponse } from "next/server";
import { validateWebhookOrSession } from "@/lib/webhook-auth";
import {
  generateMonthlyReport,
  formatMonthLabel,
  getDefaultReportMonth,
} from "@/lib/reports/monthly";

export async function GET(request: NextRequest) {
  try {
    const { authorized } = await validateWebhookOrSession(request);
    if (!authorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");

    let targetYear: number;
    let targetMonth: number;

    if (monthParam) {
      const match = monthParam.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        return NextResponse.json(
          { error: "Formato de mes inválido. Use YYYY-MM." },
          { status: 400 }
        );
      }
      targetYear = parseInt(match[1], 10);
      targetMonth = parseInt(match[2], 10);
      if (targetMonth < 1 || targetMonth > 12) {
        return NextResponse.json(
          { error: "Mes debe estar entre 01 y 12." },
          { status: 400 }
        );
      }
    } else {
      const defaults = getDefaultReportMonth();
      targetYear = defaults.year;
      targetMonth = defaults.month;
    }

    const supervisors = await generateMonthlyReport(targetYear, targetMonth);

    const reportMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

    console.log(
      `[REPORTES] MENSUAL: Reporte generado para ${reportMonth} — ${supervisors.length} supervisores`
    );

    return NextResponse.json({
      reportMonth,
      reportMonthLabel: formatMonthLabel(targetYear, targetMonth),
      generatedAt: new Date().toISOString(),
      supervisors,
    });
  } catch (error) {
    console.error("[REPORTES] MENSUAL ERROR:", error);
    return NextResponse.json(
      { error: "Error al generar reporte mensual" },
      { status: 500 }
    );
  }
}
