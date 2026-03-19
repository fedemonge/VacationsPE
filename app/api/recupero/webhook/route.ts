import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFile, parseDate } from "@/lib/recupero/parser";
import { determineCoordStatus, isBurned } from "@/lib/recupero/geo";
import { isSuccessful } from "@/lib/recupero/types";
import type { ImportResult } from "@/lib/recupero/types";

export async function POST(request: NextRequest) {
  // Auth via webhook secret header
  const secret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.RECUPERO_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileContent, fileName } = body as {
      fileContent: string;
      fileName: string;
    };

    if (!fileContent || !fileName) {
      return NextResponse.json(
        { error: "Se requiere fileContent (base64) y fileName" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(fileContent, "base64");
    const rows = parseFile(buffer, fileName);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene datos válidos" },
        { status: 400 }
      );
    }

    // Create the import record
    const importRecord = await prisma.recuperoImport.create({
      data: {
        fileName,
        source: "SHAREPOINT",
        totalRows: rows.length,
      },
    });

    let imported = 0;
    let errors = 0;
    let burned = 0;
    let outsidePeru = 0;
    let missingCoords = 0;

    for (const row of rows) {
      try {
        // Determine coordinate status
        const { coordStatus, finalLat, finalLon } = determineCoordStatus(
          row.latitud,
          row.longitud,
          row.direccion
        );

        if (coordStatus === "OUTSIDE_PERU") outsidePeru++;
        if (coordStatus === "MISSING") missingCoords++;

        // Check if burned
        const successful = isSuccessful(row.estado);
        const burnResult = isBurned(
          successful,
          finalLat,
          finalLon,
          row.latitud_cierre ?? null,
          row.longitud_cierre ?? null
        );
        if (burnResult.burned) burned++;

        // Extract period from fechaCierre
        const fechaCierreDate = parseDate(row.fecha_cierre);
        const periodoYear = fechaCierreDate
          ? fechaCierreDate.getFullYear()
          : new Date().getFullYear();
        const periodoMonth = fechaCierreDate
          ? fechaCierreDate.getMonth() + 1
          : new Date().getMonth() + 1;

        await prisma.recuperoTask.create({
          data: {
            importId: importRecord.id,
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
            tipoBase: row.tipo_base || null,
            distanciaMetros: burnResult.distanceMeters,
            esQuemada: burnResult.burned,
            coordStatus,
            latitudExtraida:
              coordStatus === "EXTRACTED" ? finalLat : null,
            longitudExtraida:
              coordStatus === "EXTRACTED" ? finalLon : null,
            periodoYear,
            periodoMonth,
          },
        });

        imported++;
      } catch (err) {
        console.error("[RECUPERO WEBHOOK] Row error:", err);
        errors++;
      }
    }

    // Update import record with final counts
    await prisma.recuperoImport.update({
      where: { id: importRecord.id },
      data: {
        importedRows: imported,
        errorRows: errors,
      },
    });

    const result: ImportResult = {
      importId: importRecord.id,
      totalRows: rows.length,
      imported,
      errors,
      burned,
      outsidePeru,
      missingCoords,
    };

    console.log(
      `[RECUPERO WEBHOOK] ${fileName}: ${imported} importados, ${errors} errores, ${burned} quemadas`
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[RECUPERO WEBHOOK] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar el webhook" },
      { status: 500 }
    );
  }
}
