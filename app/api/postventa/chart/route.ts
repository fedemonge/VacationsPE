import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateBusinessDays } from "@/lib/postventa/tat-engine";
import { TatCalcOptions } from "@/lib/postventa/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const chartType = searchParams.get("type") || "volume-trend";

  const where: Record<string, unknown> = {};
  const anoIng = searchParams.get("anoIng");
  const mesIng = searchParams.get("mesIng");
  if (anoIng) where.anoIng = parseInt(anoIng, 10);
  if (mesIng) where.mesIng = parseInt(mesIng, 10);
  const segmento = searchParams.get("segmento");
  if (segmento) where.segmento = segmento;
  const marca = searchParams.get("marca");
  if (marca) where.marca = marca;
  const estadoOrden = searchParams.get("estadoOrden");
  if (estadoOrden) where.estadoOrden = estadoOrden;
  const estadoOperativo = searchParams.get("estadoOperativo");
  if (estadoOperativo) where.estadoOperativo = estadoOperativo;
  const gestionable = searchParams.get("gestionable");
  if (gestionable) where.gestionable = gestionable;
  const ciudadHomologada = searchParams.get("ciudadHomologada");
  if (ciudadHomologada) where.ciudadHomologada = ciudadHomologada;
  const tipoDeZona = searchParams.get("tipoDeZona");
  if (tipoDeZona) where.tipoDeZona = tipoDeZona;
  const condicionCalculada = searchParams.get("condicionCalculada");
  if (condicionCalculada) where.condicionCalculada = condicionCalculada;
  const cierreOdsxEstado = searchParams.get("cierreOdsxEstado");
  if (cierreOdsxEstado) where.cierreOdsxEstado = cierreOdsxEstado;
  const pais = searchParams.get("pais");
  if (pais) where.pais = pais;

  const ordenes = await prisma.postventaOrden.findMany({
    where,
    select: {
      periodoIngreso: true,
      anoIng: true,
      mesIng: true,
      cierreOdsxEstado: true,
      segmento: true,
      ingreso: true,
      envio: true,
      targetTatGarantias: true,
      cumplTatGarantiaCalc: true,
      cumplTatWodenCalc: true,
      tatIngresoADiag: true,
      tatDiagAReparacion: true,
      tatReparacionACalidad: true,
      tatCalidadARetorno: true,
      tatRetornoAEntrega: true,
    },
  });

  // Proxy TAT for open orders
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));
  const holidays = await prisma.postventaFeriado.findMany({ where: { isActive: true, pais: "PERU" } });
  const holidayDates = holidays.map((h) => new Date(h.fecha));
  const today = new Date();

  const effective = ordenes.map((o) => {
    let cumplGar = o.cumplTatGarantiaCalc;
    if (o.cierreOdsxEstado === "ABIERTO" && o.ingreso && cumplGar === null) {
      const config = configMap.get(o.segmento || "");
      const opts: TatCalcOptions = {
        includeSaturdays: config?.consideraSabados ?? false,
        includeSundays: config?.consideraDomingos ?? false,
        includeHolidays: config?.consideraFeriados ?? false,
        holidays: holidayDates,
      };
      const targetGar = config?.tatMaximoGarantia ?? o.targetTatGarantias ?? 5;
      const tatGar = calculateBusinessDays(o.ingreso, today, opts);
      cumplGar = tatGar !== null ? tatGar <= targetGar : null;
    }
    return { ...o, cumplGar };
  });

  if (chartType === "volume-trend") {
    // Monthly volume: open vs closed
    const byPeriod: Record<string, { periodo: string; abiertas: number; cerradas: number }> = {};
    for (const o of effective) {
      const key = o.periodoIngreso || `${o.anoIng}-${String(o.mesIng).padStart(2, "0")}`;
      if (!key || key === "null-0") continue;
      if (!byPeriod[key]) byPeriod[key] = { periodo: key, abiertas: 0, cerradas: 0 };
      if (o.cierreOdsxEstado === "ABIERTO") byPeriod[key].abiertas++;
      else byPeriod[key].cerradas++;
    }
    return NextResponse.json({
      chartData: Object.values(byPeriod).sort((a, b) => a.periodo.localeCompare(b.periodo)),
    });
  }

  if (chartType === "tat-compliance") {
    // Monthly compliance % per operator
    const byPeriodSeg: Record<string, { periodo: string; segmento: string; total: number; cumple: number }> = {};
    for (const o of effective) {
      if (o.cumplGar === null) continue;
      const periodo = o.periodoIngreso || `${o.anoIng}-${String(o.mesIng).padStart(2, "0")}`;
      if (!periodo || periodo === "null-0") continue;
      const seg = o.segmento || "Otro";
      const key = `${periodo}|${seg}`;
      if (!byPeriodSeg[key]) byPeriodSeg[key] = { periodo, segmento: seg, total: 0, cumple: 0 };
      byPeriodSeg[key].total++;
      if (o.cumplGar) byPeriodSeg[key].cumple++;
    }
    const chartData = Object.values(byPeriodSeg)
      .map((d) => ({
        periodo: d.periodo,
        segmento: d.segmento,
        cumplimiento: d.total > 0 ? Math.round((d.cumple / d.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    return NextResponse.json({ chartData });
  }

  if (chartType === "subprocess") {
    // Average days at each subprocess stage
    const stages = [
      { key: "tatIngresoADiag", label: "Ingreso → Diagnóstico" },
      { key: "tatDiagAReparacion", label: "Diagnóstico → Reparación" },
      { key: "tatReparacionACalidad", label: "Reparación → Calidad" },
      { key: "tatCalidadARetorno", label: "Calidad → Retorno" },
      { key: "tatRetornoAEntrega", label: "Retorno → Entrega" },
    ];

    const chartData = stages.map((stage) => {
      const vals = effective
        .map((o) => (o as Record<string, unknown>)[stage.key] as number | null)
        .filter((v): v is number => v !== null && v > 0);
      return {
        etapa: stage.label,
        promedio: vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0,
        cantidad: vals.length,
      };
    });

    return NextResponse.json({ chartData });
  }

  return NextResponse.json({ chartData: [] });
}
