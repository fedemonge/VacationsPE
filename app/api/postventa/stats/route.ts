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

  const allOrdenes = await prisma.postventaOrden.findMany({
    where,
    select: {
      cierreOdsxEstado: true,
      estadoOperativo: true,
      gestionable: true,
      marca: true,
      segmento: true,
      ingreso: true,
      envio: true,
      targetTatGarantias: true,
      tatGarantiasCalc: true,
      tatWodenCalc: true,
      tatLaboratorioCalc: true,
      cumplTatGarantiaCalc: true,
      cumplTatWodenCalc: true,
      cumplTatLabCalc: true,
    },
  });

  // Load configs + holidays for proxy TAT on open orders
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));
  const holidays = await prisma.postventaFeriado.findMany({ where: { isActive: true, pais: "PERU" } });
  const holidayDates = holidays.map((h) => new Date(h.fecha));
  const today = new Date();

  // Compute effective TATs (proxy for open orders)
  const effective = allOrdenes.map((o) => {
    let tatGar = o.tatGarantiasCalc;
    let tatWod = o.tatWodenCalc;
    let tatLab = o.tatLaboratorioCalc;
    let cumplGar = o.cumplTatGarantiaCalc;
    let cumplWod = o.cumplTatWodenCalc;
    let cumplLab = o.cumplTatLabCalc;

    if (o.cierreOdsxEstado === "ABIERTO" && o.ingreso) {
      const config = configMap.get(o.segmento || "");
      const opts: TatCalcOptions = {
        includeSaturdays: config?.consideraSabados ?? false,
        includeSundays: config?.consideraDomingos ?? false,
        includeHolidays: config?.consideraFeriados ?? false,
        holidays: holidayDates,
      };
      const targetGar = config?.tatMaximoGarantia ?? o.targetTatGarantias ?? 5;
      const targetWod = config?.tatObjetivoWoden ?? 3;
      const targetLab = config?.tatObjetivoLab ?? 1;

      if (tatGar === null) { tatGar = calculateBusinessDays(o.ingreso, today, opts); cumplGar = tatGar !== null ? tatGar <= targetGar : null; }
      if (tatWod === null) { tatWod = calculateBusinessDays(o.ingreso, today, opts); cumplWod = tatWod !== null ? tatWod <= targetWod : null; }
      if (tatLab === null && o.envio) { tatLab = calculateBusinessDays(o.envio, today, opts); cumplLab = tatLab !== null ? tatLab <= targetLab : null; }
    }

    return { ...o, tatGar, tatWod, tatLab, cumplGar, cumplWod, cumplLab };
  });

  const totalOrdenes = effective.length;
  const abiertas = effective.filter((o) => o.cierreOdsxEstado === "ABIERTO").length;
  const cerradas = effective.filter((o) => o.cierreOdsxEstado === "CERRADO").length;
  const gestionables = effective.filter((o) => o.gestionable === "Gestionable_woden").length;
  const noGestionables = effective.filter((o) => o.gestionable === "No_gestionable_Woden").length;

  // TAT compliance (using effective values)
  const withTatGarantia = effective.filter((o) => o.cumplGar !== null);
  const cumplTatGarantia = withTatGarantia.length > 0
    ? Math.round((withTatGarantia.filter((o) => o.cumplGar === true).length / withTatGarantia.length) * 1000) / 10
    : 0;

  const withTatWoden = effective.filter((o) => o.cumplWod !== null);
  const cumplTatWoden = withTatWoden.length > 0
    ? Math.round((withTatWoden.filter((o) => o.cumplWod === true).length / withTatWoden.length) * 1000) / 10
    : 0;

  const withTatLab = effective.filter((o) => o.cumplLab !== null);
  const cumplTatLab = withTatLab.length > 0
    ? Math.round((withTatLab.filter((o) => o.cumplLab === true).length / withTatLab.length) * 1000) / 10
    : 0;

  // Averages
  const tatGarantiaVals = effective.map((o) => o.tatGar).filter((v): v is number => v !== null);
  const tatWodenVals = effective.map((o) => o.tatWod).filter((v): v is number => v !== null);
  const tatLabVals = effective.map((o) => o.tatLab).filter((v): v is number => v !== null);

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  // Breakdowns
  const porEstadoOperativo = Object.entries(
    allOrdenes.reduce((acc, o) => {
      const k = o.estadoOperativo || "Sin estado";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([estado, cantidad]) => ({ estado, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const porMarca = Object.entries(
    allOrdenes.reduce((acc, o) => {
      const k = o.marca || "Sin marca";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([marca, cantidad]) => ({ marca, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const porSegmento = Object.entries(
    allOrdenes.reduce((acc, o) => {
      const k = o.segmento || "Sin segmento";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([segmento, cantidad]) => ({ segmento, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return NextResponse.json({
    totalOrdenes,
    abiertas,
    cerradas,
    gestionables,
    noGestionables,
    cumplimientoTatGarantia: cumplTatGarantia,
    cumplimientoTatWoden: cumplTatWoden,
    cumplimientoTatLab: cumplTatLab,
    tatPromedioGarantia: avg(tatGarantiaVals),
    tatPromedioWoden: avg(tatWodenVals),
    tatPromedioLab: avg(tatLabVals),
    porEstadoOperativo,
    porMarca,
    porSegmento,
  });
}
