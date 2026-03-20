import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseFile, parseDate } from "@/lib/recupero/parser";
import { determineCoordStatus, isBurned } from "@/lib/recupero/geo";
import { isSuccessful, isAgendado } from "@/lib/recupero/types";

// In-memory progress tracking (per importId)
const progressMap = new Map<
  string,
  { processed: number; total: number; phase: string; done: boolean; result?: Record<string, unknown> }
>();

function getProgress(importId: string) {
  return progressMap.get(importId) || null;
}

// GET: list imports or check progress
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const progressId = searchParams.get("progressId");

  // If checking progress
  if (progressId) {
    const progress = progressMap.get(progressId);
    if (!progress) {
      return NextResponse.json({ error: "Import no encontrado" }, { status: 404 });
    }
    return NextResponse.json(progress);
  }

  // List import history
  const imports = await prisma.recuperoImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ imports });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un archivo" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Phase 1: Parse
    const rows = parseFile(buffer, file.name);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene datos válidos" },
        { status: 400 }
      );
    }

    // Detect if file has equipment data
    const hasEquipment = rows.some(r => r.serial !== undefined);

    // Group rows by visit key (contrato + agente + fecha_cierre) to count unique visits
    const visitKeys = new Set<string>();
    for (const row of rows) {
      const visitKey = `${row.contrato || ""}|${row.agente_campo || ""}|${row.fecha_cierre || ""}`;
      visitKeys.add(visitKey);
    }
    const totalVisits = visitKeys.size;

    // Create the import record
    const importRecord = await prisma.recuperoImport.create({
      data: {
        fileName: file.name,
        source: "MANUAL",
        totalRows: rows.length,
        importedByEmail: session.email,
        importedByName: session.email,
      },
    });

    // Set up progress tracking
    progressMap.set(importRecord.id, {
      processed: 0,
      total: totalVisits,
      phase: "Procesando registros...",
      done: false,
    });

    // Process in background (don't await)
    processImport(importRecord.id, rows, hasEquipment).catch((err) => {
      console.error("[RECUPERO IMPORT] Background error:", err);
      const p = progressMap.get(importRecord.id);
      if (p) {
        p.phase = "Error: " + (err?.message || "Error desconocido");
        p.done = true;
      }
    });

    // Return immediately with importId for progress polling
    return NextResponse.json({
      importId: importRecord.id,
      totalRows: rows.length,
      status: "processing",
    });
  } catch (error) {
    console.error("[RECUPERO IMPORT] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar el archivo" },
      { status: 500 }
    );
  }
}

// Build a task data object from a row (first row of a group for visit-level data)
function buildTaskData(
  importId: string,
  row: ReturnType<typeof parseFile>[number],
  equiposRecuperados: number
) {
  const { coordStatus, finalLat, finalLon } = determineCoordStatus(
    row.latitud,
    row.longitud,
    row.direccion
  );

  const successful = isSuccessful(row.tipo_cierre);
  const burnResult = isBurned(
    successful,
    finalLat,
    finalLon,
    row.latitud_cierre ?? null,
    row.longitud_cierre ?? null
  );

  const fechaCierreDate = parseDate(row.fecha_cierre);
  const periodoYear = fechaCierreDate
    ? fechaCierreDate.getFullYear()
    : new Date().getFullYear();
  const periodoMonth = fechaCierreDate
    ? fechaCierreDate.getMonth() + 1
    : new Date().getMonth() + 1;

  return {
    taskData: {
      importId,
      externalId: row.id || null,
      contrato: row.contrato || null,
      grupo: row.grupo || null,
      documentoId: row.documento_id || null,
      agenteCampo: row.agente_campo,
      cedulaUsuario: row.cedula_usuario || null,
      nombreUsuario: row.nombre_usuario || null,
      direccion: row.direccion || null,
      ciudad: row.ciudad || null,
      departamento: row.departamento || null,
      latitud: finalLat,
      longitud: finalLon,
      tarea: row.tarea || null,
      fechaCierre: fechaCierreDate,
      estado: row.estado || null,
      latitudCierre: row.latitud_cierre ?? null,
      longitudCierre: row.longitud_cierre ?? null,
      tipoCierre: row.tipo_cierre || null,
      tipoBase: row.tipo_base || null,
      distanciaMetros: burnResult.distanceMeters,
      esQuemada: burnResult.burned,
      esAgendado: isAgendado(row.tarea),
      coordStatus,
      latitudExtraida: coordStatus === "EXTRACTED" ? finalLat : null,
      longitudExtraida: coordStatus === "EXTRACTED" ? finalLon : null,
      periodoYear,
      periodoMonth,
      periodoDay: fechaCierreDate ? fechaCierreDate.getDate() : 1,
      equiposRecuperados,
    },
    coordStatus,
    burned: burnResult.burned,
  };
}

// Build equipment data from a row
function buildEquipoData(row: ReturnType<typeof parseFile>[number]) {
  return {
    serial: row.serial || null,
    serialAdicional: row.serial_adicional || null,
    tarjetas: row.tarjetas ?? false,
    controles: row.controles ?? false,
    fuentes: row.fuentes ?? false,
    cablePoder: row.cable_poder ?? false,
    cableFibra: row.cable_fibra ?? false,
    cableHdmi: row.cable_hdmi ?? false,
    cablesRca: row.cables_rca ?? false,
    cablesRj11: row.cables_rj11 ?? false,
    cablesRj45: row.cables_rj45 ?? false,
    gestionExitosa: row.gestion_exitosa ?? false,
  };
}

async function processImport(
  importId: string,
  rows: ReturnType<typeof parseFile>,
  hasEquipment: boolean
) {
  let imported = 0;
  let errors = 0;
  let burned = 0;
  let outsidePeru = 0;
  let missingCoords = 0;
  let duplicates = 0;

  // Group rows by visit key (contrato + agente + fecha_cierre) to handle
  // multiple equipment rows per visit. Each unique combination = 1 visit.
  type VisitGroup = { externalId: string | undefined; visitKey: string; rows: typeof rows };
  const visitGroups: VisitGroup[] = [];

  const groupMap = new Map<string, { firstId: string | undefined; rows: typeof rows }>();
  for (const row of rows) {
    // Build visit key from contrato + agente + fecha_cierre
    const visitKey = `${row.contrato || ""}|${row.agente_campo || ""}|${row.fecha_cierre || ""}`;
    const existing = groupMap.get(visitKey);
    if (existing) {
      existing.rows.push(row);
    } else {
      groupMap.set(visitKey, { firstId: row.id, rows: [row] });
    }
  }
  groupMap.forEach((group, visitKey) => {
    visitGroups.push({ externalId: group.firstId, visitKey, rows: group.rows });
  });

  const totalVisits = visitGroups.length;
  const BATCH_SIZE = 500;

  for (let i = 0; i < totalVisits; i += BATCH_SIZE) {
    const batch = visitGroups.slice(i, i + BATCH_SIZE);

    // Check for existing externalIds to skip duplicates
    const batchIds = batch
      .map(g => g.externalId)
      .filter(Boolean) as string[];
    const existingIds = new Set<string>();
    if (batchIds.length > 0) {
      const existing = await prisma.recuperoTask.findMany({
        where: { externalId: { in: batchIds } },
        select: { externalId: true },
      });
      existing.forEach(e => {
        if (e.externalId) existingIds.add(e.externalId);
      });
    }

    for (const group of batch) {
      try {
        // Skip duplicates
        if (group.externalId && existingIds.has(group.externalId)) {
          duplicates++;
          continue;
        }

        const firstRow = group.rows[0];

        if (hasEquipment) {
          // Equipment mode: create task + equipment atomically
          const equiposExitosos = group.rows.filter(
            r => r.gestion_exitosa === true
          ).length;

          const { taskData, coordStatus, burned: isBurnedResult } =
            buildTaskData(importId, firstRow, equiposExitosos);

          if (coordStatus === "OUTSIDE_PERU") outsidePeru++;
          if (coordStatus === "MISSING") missingCoords++;
          if (isBurnedResult) burned++;

          const equipos = group.rows.map(r => buildEquipoData(r));

          await prisma.$transaction(async (tx) => {
            const task = await tx.recuperoTask.create({ data: taskData });
            if (equipos.length > 0) {
              await tx.recuperoEquipo.createMany({
                data: equipos.map(eq => ({ ...eq, taskId: task.id })),
              });
            }
          });
        } else {
          // Legacy mode: no equipment columns, bulk insert tasks only
          const { taskData, coordStatus, burned: isBurnedResult } =
            buildTaskData(importId, firstRow, 0);

          if (coordStatus === "OUTSIDE_PERU") outsidePeru++;
          if (coordStatus === "MISSING") missingCoords++;
          if (isBurnedResult) burned++;

          await prisma.recuperoTask.create({ data: taskData });
        }

        imported++;
      } catch {
        errors++;
      }
    }

    // Update progress
    const progress = progressMap.get(importId);
    if (progress) {
      const processed = Math.min(i + batch.length, totalVisits);
      progress.processed = processed;
      progress.phase = `Procesando registros... (${processed.toLocaleString()} / ${totalVisits.toLocaleString()})`;
    }
  }

  // Update import record
  await prisma.recuperoImport.update({
    where: { id: importId },
    data: { importedRows: imported, errorRows: errors },
  });

  // Mark done
  const progress = progressMap.get(importId);
  if (progress) {
    progress.processed = totalVisits;
    progress.phase = "Completado";
    progress.done = true;
    progress.result = {
      importId,
      totalRows: rows.length,
      totalVisits,
      imported,
      errors,
      burned,
      outsidePeru,
      missingCoords,
      duplicates,
    };
  }

  // Clean up progress after 5 minutes
  setTimeout(() => progressMap.delete(importId), 5 * 60 * 1000);

  console.log(
    `[RECUPERO IMPORT] ${importId}: ${imported} importados (${rows.length} filas, ${totalVisits} visitas), ${duplicates} duplicados, ${errors} errores, ${burned} quemadas`
  );
}
