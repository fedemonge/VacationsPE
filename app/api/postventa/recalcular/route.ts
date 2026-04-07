import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateSubProcessTats } from "@/lib/postventa/tat-engine";
import { TatCalcOptions } from "@/lib/postventa/types";

export const dynamic = "force-dynamic";

const progressMap = new Map<string, { processed: number; total: number; done: boolean; phase: string }>();

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const progressId = searchParams.get("progressId");
  if (!progressId)
    return NextResponse.json({ error: "progressId requerido" }, { status: 400 });

  const progress = progressMap.get(progressId);
  if (!progress)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json(progress);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const segmentoFilter = body.segmento || null;

  const where: Record<string, unknown> = {};
  if (segmentoFilter) where.segmento = segmentoFilter;

  const total = await prisma.postventaOrden.count({ where });
  const progressId = crypto.randomUUID();
  progressMap.set(progressId, { processed: 0, total, done: false, phase: "Iniciando recálculo..." });

  // Background recalculation
  recalculate(progressId, where, total).catch((err) => {
    console.error("[POSTVENTA RECALCULAR] Error:", err);
    const p = progressMap.get(progressId);
    if (p) { p.phase = "Error: " + (err?.message || "desconocido"); p.done = true; }
  });

  return NextResponse.json({ progressId, total });
}

async function recalculate(progressId: string, where: Record<string, unknown>, total: number) {
  const progress = progressMap.get(progressId)!;

  // Load configs
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));

  // Load holidays
  const holidays = await prisma.postventaFeriado.findMany({
    where: { isActive: true, pais: "PERU" },
  });
  const holidayDates = holidays.map((h) => new Date(h.fecha));

  const BATCH_SIZE = 200;
  let skip = 0;
  let processed = 0;

  while (skip < total) {
    const batch = await prisma.postventaOrden.findMany({
      where,
      skip,
      take: BATCH_SIZE,
      select: {
        id: true,
        segmento: true,
        ingreso: true,
        envio: true,
        diagnostico: true,
        reparacion: true,
        calidad: true,
        retorno: true,
        entrega: true,
        targetTatGarantias: true,
      },
    });

    if (batch.length === 0) break;

    for (const orden of batch) {
      const config = configMap.get(orden.segmento || "");
      const tatOptions: TatCalcOptions = {
        includeSaturdays: config?.consideraSabados ?? false,
        includeSundays: config?.consideraDomingos ?? false,
        includeHolidays: config?.consideraFeriados ?? false,
        holidays: holidayDates,
      };
      const targets = {
        garantia: config?.tatMaximoGarantia ?? orden.targetTatGarantias ?? 5,
        woden: config?.tatObjetivoWoden ?? 3,
        lab: config?.tatObjetivoLab ?? 1,
      };

      const tats = calculateSubProcessTats(orden, tatOptions, targets);

      await prisma.postventaOrden.update({
        where: { id: orden.id },
        data: tats,
      });

      processed++;
    }

    skip += BATCH_SIZE;
    progress.processed = processed;
    progress.phase = `Recalculando... (${processed}/${total})`;
  }

  progress.done = true;
  progress.phase = `Completado: ${processed} órdenes recalculadas`;
  setTimeout(() => progressMap.delete(progressId), 5 * 60 * 1000);
}
