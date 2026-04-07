import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parsePostventaFile } from "@/lib/postventa/parser";
import { calculateSubProcessTats } from "@/lib/postventa/tat-engine";
import { seedHolidays } from "@/lib/postventa/seed-holidays";
import { ImportProgress, TatCalcOptions } from "@/lib/postventa/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const progressMap = new Map<string, ImportProgress>();

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const progressId = searchParams.get("progressId");

  if (progressId) {
    const progress = progressMap.get(progressId);
    if (!progress) {
      return NextResponse.json({ error: "Import no encontrado" }, { status: 404 });
    }
    return NextResponse.json(progress);
  }

  const imports = await prisma.postventaImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { ordenes: true } } },
  });

  return NextResponse.json({ imports });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Ensure holidays are seeded on first import
  await seedHolidays(prisma);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó un archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || "upload.txt";
    const rows = parsePostventaFile(buffer, fileName);

    if (rows.length === 0) {
      return NextResponse.json({ error: "El archivo no contiene datos válidos" }, { status: 400 });
    }

    const importRecord = await prisma.postventaImport.create({
      data: {
        fileName,
        source: "MANUAL",
        totalRows: rows.length,
        importedByEmail: session.email,
      },
    });

    progressMap.set(importRecord.id, {
      processed: 0,
      total: rows.length,
      phase: "Procesando registros...",
      done: false,
    });

    processImport(importRecord.id, rows).catch((err) => {
      console.error("[POSTVENTA IMPORT] Background error:", err);
      const p = progressMap.get(importRecord.id);
      if (p) {
        p.phase = "Error: " + (err?.message || "Error desconocido");
        p.done = true;
      }
    });

    return NextResponse.json({
      importId: importRecord.id,
      totalRows: rows.length,
      status: "processing",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[POSTVENTA IMPORT] ERROR:", errMsg);
    return NextResponse.json({ error: `Error al procesar: ${errMsg}` }, { status: 500 });
  }
}

async function processImport(importId: string, rows: ReturnType<typeof parsePostventaFile>) {
  const progress = progressMap.get(importId)!;
  let imported = 0;
  let updated = 0;
  let errors = 0;

  // Load TAT configs
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));

  // Load holidays
  const holidays = await prisma.postventaFeriado.findMany({
    where: { isActive: true, pais: "PERU" },
  });
  const holidayDates = holidays.map((h) => new Date(h.fecha));

  const BATCH_SIZE = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    try {
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          try {
            // Calculate TATs based on config
            const config = configMap.get(row.segmento || "");
            const tatOptions: TatCalcOptions = {
              includeSaturdays: config?.consideraSabados ?? false,
              includeSundays: config?.consideraDomingos ?? false,
              includeHolidays: config?.consideraFeriados ?? false,
              holidays: holidayDates,
            };
            const targets = {
              garantia: config?.tatMaximoGarantia ?? row.targetTatGarantias ?? 5,
              woden: config?.tatObjetivoWoden ?? 3,
              lab: config?.tatObjetivoLab ?? 1,
            };
            const tats = calculateSubProcessTats(row, tatOptions, targets);

            const data = {
              importId,
              preodsNumero: row.preodsNumero,
              odsNumero: row.odsNumero,
              imei: row.imei,
              segmento: row.segmento,
              marca: row.marca,
              modelo: row.modelo,
              sucursal: row.sucursal,
              ciudad: row.ciudad,
              pais: row.pais || "PERU",
              preorden: row.preorden,
              ingreso: row.ingreso,
              ingresoUsuario: row.ingresoUsuario,
              envio: row.envio,
              envioUsuario: row.envioUsuario,
              diagnostico: row.diagnostico,
              diagnosticoUsuario: row.diagnosticoUsuario,
              revision: row.revision,
              fechaPendiente: row.fechaPendiente,
              fechaEscalado: row.fechaEscalado,
              fechaCotizado: row.fechaCotizado,
              fechaFinanciamiento: row.fechaFinanciamiento,
              fechaDevolucion: row.fechaDevolucion,
              entregaAlmacen: row.entregaAlmacen,
              fechaIrreparable: row.fechaIrreparable,
              reparacion: row.reparacion,
              estadoFinal: row.estadoFinal,
              reparacionUsuario: row.reparacionUsuario,
              calidad: row.calidad,
              calidadUsuario: row.calidadUsuario,
              retorno: row.retorno,
              retornoUsuario: row.retornoUsuario,
              entrega: row.entrega,
              entregaUsuario: row.entregaUsuario,
              condicionIngreso: row.condicionIngreso,
              descCondicion: row.descCondicion,
              estadoOperativo: row.estadoOperativo,
              estadoOrden: row.estadoOrden,
              cierreOdsxEstado: row.cierreOdsxEstado,
              gestionable: row.gestionable,
              condicionCalculada: row.condicionCalculada,
              ciudadHomologada: row.ciudadHomologada,
              tipoDeZona: row.tipoDeZona,
              targetTatGarantias: row.targetTatGarantias,
              tatGarantiasArchivo: row.tatGarantiasArchivo,
              cumplTatGarantia: row.cumplTatGarantia,
              targetTatLaboratorio: row.targetTatLaboratorio,
              tatWodenArchivo: row.tatWodenArchivo,
              cumplTatWoden: row.cumplTatWoden,
              tatLaboratorioArchivo: row.tatLaboratorioArchivo,
              cumplTatLaboratorio: row.cumplTatLaboratorio,
              tiempoEsperaReparacion: row.tiempoEsperaReparacion,
              desvioTatGarantias: row.desvioTatGarantias,
              periodoIngreso: row.periodoIngreso,
              anoIng: row.anoIng,
              mesIng: row.mesIng,
              diaIngreso: row.diaIngreso,
              periodoCierre: row.periodoCierre,
              anoCierre: row.anoCierre,
              mesCierre: row.mesCierre,
              diaCierre: row.diaCierre,
              annoIngreso: row.annoIngreso,
              mesIngreso: row.mesIngreso,
              annoDiagnostico: row.annoDiagnostico,
              mesDiagnostico: row.mesDiagnostico,
              annoReparacion: row.annoReparacion,
              mesReparacion: row.mesReparacion,
              linea: row.linea,
              fechaActualizacion: row.fechaActualizacion,
              // Calculated TATs
              ...tats,
            };

            // Upsert by ODS number: update if exists, create if not
            const existingOds = row.odsNumero
              ? await tx.postventaOrden.findFirst({ where: { odsNumero: row.odsNumero } })
              : null;

            if (existingOds) {
              await tx.postventaOrden.update({
                where: { id: existingOds.id },
                data,
              });
              updated++;
            } else {
              await tx.postventaOrden.create({ data });
              imported++;
            }
          } catch (rowErr) {
            console.error("[POSTVENTA IMPORT] Row error:", rowErr);
            errors++;
          }
        }
      });
    } catch (batchErr) {
      console.error("[POSTVENTA IMPORT] Batch error:", batchErr);
      errors += batch.length;
    }

    progress.processed = Math.min(i + BATCH_SIZE, rows.length);
    progress.phase = `Procesando registros... (${progress.processed}/${rows.length})`;
  }

  // Update import record
  await prisma.postventaImport.update({
    where: { id: importId },
    data: { importedRows: imported + updated, errorRows: errors },
  });

  progress.done = true;
  progress.phase = "Completado";
  progress.result = { imported, updated, errors, totalRows: rows.length };

  // Clean up progress after 5 minutes
  setTimeout(() => progressMap.delete(importId), 5 * 60 * 1000);
}
