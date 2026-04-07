import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateBusinessDays } from "@/lib/postventa/tat-engine";
import { TatCalcOptions } from "@/lib/postventa/types";

export const dynamic = "force-dynamic";

function buildWhere(searchParams: URLSearchParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const anoIng = searchParams.get("anoIng");
  if (anoIng) where.anoIng = parseInt(anoIng, 10);
  const mesIng = searchParams.get("mesIng");
  if (mesIng) where.mesIng = parseInt(mesIng, 10);
  const segmento = searchParams.get("segmento");
  if (segmento) where.segmento = segmento;
  const marca = searchParams.get("marca");
  if (marca) where.marca = marca;
  const gestionable = searchParams.get("gestionable");
  if (gestionable) where.gestionable = gestionable;
  const ciudadHomologada = searchParams.get("ciudadHomologada");
  if (ciudadHomologada) where.ciudadHomologada = ciudadHomologada;
  const tipoDeZona = searchParams.get("tipoDeZona");
  if (tipoDeZona) where.tipoDeZona = tipoDeZona;
  const estadoOrden = searchParams.get("estadoOrden");
  if (estadoOrden) where.estadoOrden = estadoOrden;
  const cierreOdsxEstado = searchParams.get("cierreOdsxEstado");
  if (cierreOdsxEstado) where.cierreOdsxEstado = cierreOdsxEstado;
  const condicionCalculada = searchParams.get("condicionCalculada");
  if (condicionCalculada) where.condicionCalculada = condicionCalculada;
  const estadoOperativo = searchParams.get("estadoOperativo");
  if (estadoOperativo) where.estadoOperativo = estadoOperativo;
  const pais = searchParams.get("pais");
  if (pais) where.pais = pais;
  return where;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "tat-adherence";
  const where = buildWhere(searchParams);

  if (type === "tat-adherence") {
    const ordenes = await prisma.postventaOrden.findMany({
      where,
      select: {
        segmento: true, marca: true, cierreOdsxEstado: true,
        cumplTatGarantiaCalc: true, cumplTatWodenCalc: true, cumplTatLabCalc: true,
        tatGarantiasCalc: true, tatWodenCalc: true, tatLaboratorioCalc: true,
        ingreso: true, envio: true, targetTatGarantias: true,
      },
    });

    // Load TAT configs and holidays for proxy calculation
    const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
    const configMap = new Map(configs.map((c) => [c.segmento, c]));
    const holidays = await prisma.postventaFeriado.findMany({ where: { isActive: true, pais: "PERU" } });
    const holidayDates = holidays.map((h) => new Date(h.fecha));
    const today = new Date();

    // Accumulator type
    type Acc = {
      total: number;
      cumpleGarantia: number; cumpleWoden: number; cumpleLab: number;
      totalWithGarantia: number; totalWithWoden: number; totalWithLab: number;
      sumTatGarantia: number; sumTatWoden: number; sumTatLab: number;
      countTatGarantia: number; countTatWoden: number; countTatLab: number;
    };
    const newAcc = (): Acc => ({
      total: 0,
      cumpleGarantia: 0, cumpleWoden: 0, cumpleLab: 0,
      totalWithGarantia: 0, totalWithWoden: 0, totalWithLab: 0,
      sumTatGarantia: 0, sumTatWoden: 0, sumTatLab: 0,
      countTatGarantia: 0, countTatWoden: 0, countTatLab: 0,
    });
    const addToAcc = (acc: Acc, o: typeof ordenes[number]) => {
      acc.total++;

      // For closed orders, use stored TATs. For open orders, calculate proxy TATs using today.
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

        if (tatGar === null) {
          tatGar = calculateBusinessDays(o.ingreso, today, opts);
          cumplGar = tatGar !== null ? tatGar <= targetGar : null;
        }
        if (tatWod === null) {
          tatWod = calculateBusinessDays(o.ingreso, today, opts);
          cumplWod = tatWod !== null ? tatWod <= targetWod : null;
        }
        if (tatLab === null && o.envio) {
          tatLab = calculateBusinessDays(o.envio, today, opts);
          cumplLab = tatLab !== null ? tatLab <= targetLab : null;
        }
      }

      if (cumplGar !== null) { acc.totalWithGarantia++; if (cumplGar) acc.cumpleGarantia++; }
      if (cumplWod !== null) { acc.totalWithWoden++; if (cumplWod) acc.cumpleWoden++; }
      if (cumplLab !== null) { acc.totalWithLab++; if (cumplLab) acc.cumpleLab++; }
      if (tatGar !== null) { acc.sumTatGarantia += tatGar; acc.countTatGarantia++; }
      if (tatWod !== null) { acc.sumTatWoden += tatWod; acc.countTatWoden++; }
      if (tatLab !== null) { acc.sumTatLab += tatLab; acc.countTatLab++; }
    };
    const formatAcc = (g: Acc) => ({
      total: g.total,
      pctGarantia: g.totalWithGarantia > 0 ? Math.round((g.cumpleGarantia / g.totalWithGarantia) * 1000) / 10 : null,
      pctWoden: g.totalWithWoden > 0 ? Math.round((g.cumpleWoden / g.totalWithWoden) * 1000) / 10 : null,
      pctLab: g.totalWithLab > 0 ? Math.round((g.cumpleLab / g.totalWithLab) * 1000) / 10 : null,
      avgTatGarantia: g.countTatGarantia > 0 ? Math.round((g.sumTatGarantia / g.countTatGarantia) * 10) / 10 : null,
      avgTatWoden: g.countTatWoden > 0 ? Math.round((g.sumTatWoden / g.countTatWoden) * 10) / 10 : null,
      avgTatLab: g.countTatLab > 0 ? Math.round((g.sumTatLab / g.countTatLab) * 10) / 10 : null,
    });

    // Group: operator → marca AND marca → operator
    const byOp: Record<string, { acc: Acc; children: Record<string, Acc> }> = {};
    const byMar: Record<string, { acc: Acc; children: Record<string, Acc> }> = {};
    for (const o of ordenes) {
      const seg = o.segmento || "Sin operador";
      const mar = o.marca || "Sin marca";
      // By operator
      if (!byOp[seg]) byOp[seg] = { acc: newAcc(), children: {} };
      if (!byOp[seg].children[mar]) byOp[seg].children[mar] = newAcc();
      addToAcc(byOp[seg].acc, o);
      addToAcc(byOp[seg].children[mar], o);
      // By marca
      if (!byMar[mar]) byMar[mar] = { acc: newAcc(), children: {} };
      if (!byMar[mar].children[seg]) byMar[mar].children[seg] = newAcc();
      addToAcc(byMar[mar].acc, o);
      addToAcc(byMar[mar].children[seg], o);
    }

    const formatGroup = (groups: typeof byOp) =>
      Object.entries(groups)
        .map(([label, { acc, children }]) => ({
          label,
          ...formatAcc(acc),
          children: Object.entries(children)
            .map(([childLabel, cAcc]) => ({ label: childLabel, ...formatAcc(cAcc) }))
            .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total);

    const openCount = ordenes.filter((o) => o.cierreOdsxEstado === "ABIERTO").length;

    return NextResponse.json({
      byOperador: formatGroup(byOp),
      byMarca: formatGroup(byMar),
      openCount,
      asOfDate: today.toISOString(),
    });
  }

  if (type === "aging") {
    const agingWhere = { ...where, ...(!where.cierreOdsxEstado ? { cierreOdsxEstado: "ABIERTO" } : {}) };
    const ordenes = await prisma.postventaOrden.findMany({
      where: agingWhere,
      select: {
        segmento: true, marca: true, ingreso: true,
      },
    });

    const now = new Date();
    const BUCKETS = [
      { key: "d1", label: "1d", min: 0, max: 1 },
      { key: "d2", label: "2d", min: 1, max: 2 },
      { key: "d3", label: "3d", min: 2, max: 3 },
      { key: "d4", label: "4d", min: 3, max: 4 },
      { key: "d5", label: "5d", min: 4, max: 5 },
      { key: "d6", label: "6d", min: 5, max: 6 },
      { key: "d7", label: "7d", min: 6, max: 7 },
      { key: "d8_15", label: "8-15d", min: 7, max: 15 },
      { key: "d15plus", label: ">15d", min: 15, max: Infinity },
    ];

    type BucketCounts = Record<string, number>;
    const newBuckets = (): BucketCounts => {
      const b: BucketCounts = { total: 0 };
      for (const bucket of BUCKETS) b[bucket.key] = 0;
      return b;
    };

    const byOp: Record<string, { acc: BucketCounts; children: Record<string, BucketCounts> }> = {};
    const byMar: Record<string, { acc: BucketCounts; children: Record<string, BucketCounts> }> = {};

    for (const o of ordenes) {
      if (!o.ingreso) continue;
      const days = (now.getTime() - new Date(o.ingreso).getTime()) / (1000 * 60 * 60 * 24);
      const seg = o.segmento || "Sin operador";
      const mar = o.marca || "Sin marca";

      // Find bucket
      let bucketKey = "d15plus";
      for (const bucket of BUCKETS) {
        if (days >= bucket.min && days < bucket.max) { bucketKey = bucket.key; break; }
      }

      // By operator
      if (!byOp[seg]) byOp[seg] = { acc: newBuckets(), children: {} };
      if (!byOp[seg].children[mar]) byOp[seg].children[mar] = newBuckets();
      byOp[seg].acc[bucketKey]++; byOp[seg].acc.total++;
      byOp[seg].children[mar][bucketKey]++; byOp[seg].children[mar].total++;

      // By marca
      if (!byMar[mar]) byMar[mar] = { acc: newBuckets(), children: {} };
      if (!byMar[mar].children[seg]) byMar[mar].children[seg] = newBuckets();
      byMar[mar].acc[bucketKey]++; byMar[mar].acc.total++;
      byMar[mar].children[seg][bucketKey]++; byMar[mar].children[seg].total++;
    }

    const formatAgingGroup = (groups: typeof byOp) =>
      Object.entries(groups)
        .map(([label, { acc, children }]) => ({
          label, ...acc,
          children: Object.entries(children)
            .map(([childLabel, cAcc]) => ({ label: childLabel, ...cAcc }))
            .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      byOperador: formatAgingGroup(byOp),
      byMarca: formatAgingGroup(byMar),
      buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label, min: b.min, max: b.max === Infinity ? 9999 : b.max })),
      asOfDate: now.toISOString(),
    });
  }

  if (type === "subprocess") {
    const ordenes = await prisma.postventaOrden.findMany({
      where,
      select: {
        segmento: true,
        tatIngresoADiag: true, tatDiagAReparacion: true,
        tatReparacionACalidad: true, tatCalidadARetorno: true,
        tatRetornoAEntrega: true,
      },
    });

    const stages = [
      { key: "tatIngresoADiag", label: "Ingreso → Diagnóstico" },
      { key: "tatDiagAReparacion", label: "Diagnóstico → Reparación" },
      { key: "tatReparacionACalidad", label: "Reparación → Calidad" },
      { key: "tatCalidadARetorno", label: "Calidad → Retorno" },
      { key: "tatRetornoAEntrega", label: "Retorno → Entrega" },
    ];

    const data = stages.map((stage) => {
      const vals = ordenes
        .map((o) => (o as Record<string, unknown>)[stage.key] as number | null)
        .filter((v): v is number => v !== null && v >= 0);
      const avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
      const max = vals.length > 0 ? Math.round(Math.max(...vals) * 10) / 10 : 0;
      const min = vals.length > 0 ? Math.round(Math.min(...vals) * 10) / 10 : 0;
      const median = vals.length > 0 ? Math.round(vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] * 10) / 10 : 0;
      return { etapa: stage.label, promedio: avg, maximo: max, minimo: min, mediana: median, cantidad: vals.length };
    });

    // Find bottleneck (highest avg)
    const maxAvg = Math.max(...data.map((d) => d.promedio));
    const dataWithBottleneck = data.map((d) => ({ ...d, isBottleneck: d.promedio === maxAvg && maxAvg > 0 }));

    return NextResponse.json({ data: dataWithBottleneck });
  }

  if (type === "operator") {
    const ordenes = await prisma.postventaOrden.findMany({
      where,
      select: {
        segmento: true, cierreOdsxEstado: true, gestionable: true,
        cumplTatGarantiaCalc: true, cumplTatWodenCalc: true,
        tatGarantiasCalc: true, tatWodenCalc: true,
      },
    });

    const byOp: Record<string, {
      segmento: string; total: number; abiertas: number; cerradas: number;
      gestionables: number; cumpleGar: number; totalGar: number;
      cumpleWod: number; totalWod: number;
      sumTatGar: number; countTatGar: number;
      sumTatWod: number; countTatWod: number;
    }> = {};

    for (const o of ordenes) {
      const seg = o.segmento || "Otro";
      if (!byOp[seg]) {
        byOp[seg] = {
          segmento: seg, total: 0, abiertas: 0, cerradas: 0, gestionables: 0,
          cumpleGar: 0, totalGar: 0, cumpleWod: 0, totalWod: 0,
          sumTatGar: 0, countTatGar: 0, sumTatWod: 0, countTatWod: 0,
        };
      }
      const g = byOp[seg];
      g.total++;
      if (o.cierreOdsxEstado === "ABIERTO") g.abiertas++; else g.cerradas++;
      if (o.gestionable === "Gestionable_woden") g.gestionables++;
      if (o.cumplTatGarantiaCalc !== null) { g.totalGar++; if (o.cumplTatGarantiaCalc) g.cumpleGar++; }
      if (o.cumplTatWodenCalc !== null) { g.totalWod++; if (o.cumplTatWodenCalc) g.cumpleWod++; }
      if (o.tatGarantiasCalc !== null) { g.sumTatGar += o.tatGarantiasCalc; g.countTatGar++; }
      if (o.tatWodenCalc !== null) { g.sumTatWod += o.tatWodenCalc; g.countTatWod++; }
    }

    const data = Object.values(byOp).map((g) => ({
      segmento: g.segmento,
      total: g.total,
      abiertas: g.abiertas,
      cerradas: g.cerradas,
      gestionables: g.gestionables,
      pctCumplGarantia: g.totalGar > 0 ? Math.round((g.cumpleGar / g.totalGar) * 1000) / 10 : null,
      pctCumplWoden: g.totalWod > 0 ? Math.round((g.cumpleWod / g.totalWod) * 1000) / 10 : null,
      avgTatGarantia: g.countTatGar > 0 ? Math.round((g.sumTatGar / g.countTatGar) * 10) / 10 : null,
      avgTatWoden: g.countTatWod > 0 ? Math.round((g.sumTatWod / g.countTatWod) * 10) / 10 : null,
    })).sort((a, b) => b.total - a.total);

    return NextResponse.json({ data });
  }

  return NextResponse.json({ data: [] });
}
