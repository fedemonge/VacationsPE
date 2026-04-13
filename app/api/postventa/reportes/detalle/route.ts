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
  if (anoIng) where.anoIng = parseInt(anoIng, 10);
  const mesIng = searchParams.get("mesIng");
  if (mesIng) where.mesIng = parseInt(mesIng, 10);
  const segmento = searchParams.get("segmento");
  if (segmento) where.segmento = segmento;
  const marca = searchParams.get("marca");
  if (marca) where.marca = marca;
  const estadoOrden = searchParams.get("estadoOrden");
  if (estadoOrden) where.estadoOrden = estadoOrden;
  const cierreOdsxEstado = searchParams.get("cierreOdsxEstado");
  if (cierreOdsxEstado) where.cierreOdsxEstado = cierreOdsxEstado;
  const gestionable = searchParams.get("gestionable");
  if (gestionable) where.gestionable = gestionable;
  const ciudadHomologada = searchParams.get("ciudadHomologada");
  if (ciudadHomologada) where.ciudadHomologada = ciudadHomologada;
  const tipoDeZona = searchParams.get("tipoDeZona");
  if (tipoDeZona) where.tipoDeZona = tipoDeZona;
  const sucursal = searchParams.get("sucursal");
  if (sucursal) where.sucursal = sucursal;
  const canal = searchParams.get("canal");
  if (canal) where.canal = canal;
  const pais = searchParams.get("pais");
  if (pais) where.pais = pais;
  const estadoFinal = searchParams.get("estadoFinal");
  if (estadoFinal) where.estadoFinal = estadoFinal;
  const sinOds = searchParams.get("sinOds");
  if (sinOds === "true") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { OR: [{ odsNumero: null }, { odsNumero: "" }] },
    ];
  }
  const withIngreso = searchParams.get("withIngreso");
  if (withIngreso === "true") {
    where.ingreso = { not: null };
  }
  const preordenFecha = searchParams.get("preordenFecha");
  if (preordenFecha) {
    const dayStart = new Date(preordenFecha + "T00:00:00.000Z");
    const dayEnd = new Date(preordenFecha + "T23:59:59.999Z");
    where.preorden = { gte: dayStart, lte: dayEnd };
  }

  const ordenes = await prisma.postventaOrden.findMany({
    where,
    select: {
      odsNumero: true, preodsNumero: true, imei: true, preorden: true,
      segmento: true, marca: true, modelo: true,
      sucursal: true, ciudad: true, ciudadHomologada: true, tipoDeZona: true,
      cierreOdsxEstado: true, estadoOperativo: true, estadoFinal: true,
      gestionable: true, condicionCalculada: true, descCondicion: true,
      ingreso: true, envio: true, diagnostico: true, reparacion: true,
      calidad: true, retorno: true, entrega: true,
      fechaPendiente: true, fechaEscalado: true, fechaCotizado: true,
      fechaFinanciamiento: true, fechaDevolucion: true, fechaIrreparable: true,
      targetTatGarantias: true,
      tatGarantiasCalc: true, tatWodenCalc: true, tatLaboratorioCalc: true,
      tatIngresoADiag: true, tatDiagAReparacion: true,
      tatReparacionACalidad: true, tatCalidadARetorno: true, tatRetornoAEntrega: true,
      cumplTatGarantiaCalc: true, cumplTatWodenCalc: true, cumplTatLabCalc: true,
      ingresoUsuario: true, diagnosticoUsuario: true, reparacionUsuario: true,
      calidadUsuario: true, retornoUsuario: true, entregaUsuario: true,
    },
    orderBy: { ingreso: "desc" },
  });

  // Load configs + holidays for proxy TAT on open orders
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));
  const holidays = await prisma.postventaFeriado.findMany({ where: { isActive: true, pais: "PERU" } });
  const holidayDates = holidays.map((h) => new Date(h.fecha));
  const today = new Date();

  const data = ordenes.map((o) => {
    let tatGar = o.tatGarantiasCalc;
    let tatWod = o.tatWodenCalc;
    let tatLab = o.tatLaboratorioCalc;
    let cumplGar = o.cumplTatGarantiaCalc;
    let cumplWod = o.cumplTatWodenCalc;
    let cumplLab = o.cumplTatLabCalc;
    let isProxy = false;

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

      if (tatGar === null) { tatGar = calculateBusinessDays(o.ingreso, today, opts); cumplGar = tatGar !== null ? tatGar <= targetGar : null; isProxy = true; }
      if (tatWod === null) { tatWod = calculateBusinessDays(o.ingreso, today, opts); cumplWod = tatWod !== null ? tatWod <= targetWod : null; isProxy = true; }
      if (tatLab === null && o.envio) { tatLab = calculateBusinessDays(o.envio, today, opts); cumplLab = tatLab !== null ? tatLab <= targetLab : null; isProxy = true; }
    }

    const fmtDate = (d: Date | null) => d ? new Date(d).toISOString().slice(0, 10) : "";

    return {
      ods: o.odsNumero,
      preods: o.preodsNumero,
      preorden: fmtDate(o.preorden),
      imei: o.imei,
      operador: o.segmento,
      marca: o.marca,
      modelo: o.modelo,
      sucursal: o.sucursal,
      ciudad: o.ciudadHomologada,
      zona: o.tipoDeZona,
      estado: o.cierreOdsxEstado,
      estadoOperativo: o.estadoOperativo,
      estadoFinal: o.estadoFinal,
      gestionable: o.gestionable,
      condicion: o.condicionCalculada,
      ingreso: fmtDate(o.ingreso),
      envio: fmtDate(o.envio),
      diagnostico: fmtDate(o.diagnostico),
      reparacion: fmtDate(o.reparacion),
      calidad: fmtDate(o.calidad),
      retorno: fmtDate(o.retorno),
      entrega: fmtDate(o.entrega),
      pendiente: fmtDate(o.fechaPendiente),
      escalado: fmtDate(o.fechaEscalado),
      cotizado: fmtDate(o.fechaCotizado),
      financiamiento: fmtDate(o.fechaFinanciamiento),
      devolucion: fmtDate(o.fechaDevolucion),
      irreparable: fmtDate(o.fechaIrreparable),
      targetTat: o.targetTatGarantias,
      tatGarantia: tatGar,
      tatWoden: tatWod,
      tatLab: tatLab,
      cumpleGarantia: cumplGar === null ? "" : cumplGar ? "Si" : "No",
      cumpleWoden: cumplWod === null ? "" : cumplWod ? "Si" : "No",
      cumpleLab: cumplLab === null ? "" : cumplLab ? "Si" : "No",
      tatIngresoADiag: o.tatIngresoADiag,
      tatDiagAReparacion: o.tatDiagAReparacion,
      tatReparacionACalidad: o.tatReparacionACalidad,
      tatCalidadARetorno: o.tatCalidadARetorno,
      tatRetornoAEntrega: o.tatRetornoAEntrega,
      proxy: isProxy ? "*" : "",
      tecnicoDiag: o.diagnosticoUsuario,
      tecnicoRep: o.reparacionUsuario,
      tecnicoCal: o.calidadUsuario,
    };
  });

  // Filter by aging day range if specified
  const agingMin = searchParams.get("agingMin");
  const agingMax = searchParams.get("agingMax");
  const agingDateField = sinOds === "true" ? "preorden" : "ingreso";
  let filtered = data;
  if (agingMin !== null || agingMax !== null) {
    const minDays = agingMin ? parseFloat(agingMin) : 0;
    const maxDays = agingMax ? parseFloat(agingMax) : 9999;
    filtered = data.filter((row) => {
      const dateVal = row[agingDateField] as string;
      if (!dateVal) return false;
      const days = (today.getTime() - new Date(dateVal).getTime()) / (1000 * 60 * 60 * 24);
      return days >= minDays && days < maxDays;
    });
  }

  return NextResponse.json({ data: filtered, total: filtered.length });
}
