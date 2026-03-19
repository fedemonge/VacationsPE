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

export function getProgress(importId: string) {
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
      total: rows.length,
      phase: "Procesando registros...",
      done: false,
    });

    // Process in background (don't await)
    processImport(importRecord.id, rows).catch((err) => {
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

async function processImport(importId: string, rows: ReturnType<typeof parseFile>) {
  let imported = 0;
  let errors = 0;
  let burned = 0;
  let outsidePeru = 0;
  let missingCoords = 0;
  let duplicates = 0;

  const BATCH_SIZE = 500;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Check for existing externalIds to skip duplicates
    const batchIds = batch.map(r => r.id).filter(Boolean) as string[];
    const existingIds = new Set<string>();
    if (batchIds.length > 0) {
      const existing = await prisma.recuperoTask.findMany({
        where: { externalId: { in: batchIds } },
        select: { externalId: true },
      });
      existing.forEach(e => { if (e.externalId) existingIds.add(e.externalId); });
    }

    const records = [];

    for (const row of batch) {
      try {
        // Skip duplicates
        if (row.id && existingIds.has(row.id)) {
          duplicates++;
          continue;
        }
        const { coordStatus, finalLat, finalLon } = determineCoordStatus(
          row.latitud,
          row.longitud,
          row.direccion
        );

        if (coordStatus === "OUTSIDE_PERU") outsidePeru++;
        if (coordStatus === "MISSING") missingCoords++;

        const successful = isSuccessful(row.tipo_cierre);
        const burnResult = isBurned(
          successful,
          finalLat,
          finalLon,
          row.latitud_cierre ?? null,
          row.longitud_cierre ?? null
        );
        if (burnResult.burned) burned++;

        const fechaCierreDate = parseDate(row.fecha_cierre);
        const periodoYear = fechaCierreDate
          ? fechaCierreDate.getFullYear()
          : new Date().getFullYear();
        const periodoMonth = fechaCierreDate
          ? fechaCierreDate.getMonth() + 1
          : new Date().getMonth() + 1;

        records.push({
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
        });

        imported++;
      } catch {
        errors++;
      }
    }

    // Batch insert
    if (records.length > 0) {
      await prisma.recuperoTask.createMany({ data: records });
    }

    // Update progress
    const progress = progressMap.get(importId);
    if (progress) {
      progress.processed = i + batch.length;
      progress.phase = `Procesando registros... (${Math.min(i + batch.length, rows.length).toLocaleString()} / ${rows.length.toLocaleString()})`;
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
    progress.processed = rows.length;
    progress.phase = "Completado";
    progress.done = true;
    progress.result = {
      importId,
      totalRows: rows.length,
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
    `[RECUPERO IMPORT] ${importId}: ${imported} importados, ${duplicates} duplicados, ${errors} errores, ${burned} quemadas`
  );
}
