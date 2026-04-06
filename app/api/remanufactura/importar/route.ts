import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseRemanufacturaFile } from "@/lib/remanufactura/parser";
import { RemanufacturaSource } from "@/lib/remanufactura/types";

// Allow large file uploads (WMS files can be 150MB+)
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const forcedSource = formData.get("source") as RemanufacturaSource | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, detectedSource } = parseRemanufacturaFile(
      buffer,
      file.name,
      forcedSource || undefined
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron registros válidos en el archivo" },
        { status: 400 }
      );
    }

    const source = forcedSource || detectedSource;

    // Create import record
    const importRecord = await prisma.remanufacturaImport.create({
      data: {
        source,
        fileName: file.name,
        totalRows: rows.length,
        importedByEmail: session.email,
        importedByName: session.email,
      },
    });

    // Insert via Prisma createMany in batches
    let imported = 0;
    let errors = 0;
    const BATCH_SIZE = 2000;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        await prisma.remanufacturaTransaccion.createMany({
          data: batch.map((row) => ({
            importId: importRecord.id,
            source,
            fechaTransaccion: safeDate(row.fechaTransaccion),
            transaccionId: row.transaccionId || null,
            tipoTransaccion: row.tipoTransaccion || null,
            numeroEnvio: row.numeroEnvio || null,
            numeroSerie: row.numeroSerie || null,
            codigoCategoria: row.codigoCategoria || null,
            familiaEquipo: row.familiaEquipo || null,
            clienteNormalizado: row.clienteNormalizado || null,
            orgOrigen: row.orgOrigen || null,
            nombreOrgOrigen: row.nombreOrgOrigen || null,
            subinvOrigen: row.subinvOrigen || null,
            locatorOrigen: row.locatorOrigen || null,
            orgDestino: row.orgDestino || null,
            nombreOrgDestino: row.nombreOrgDestino || null,
            subinvDestino: row.subinvDestino || null,
            locatorDestino: row.locatorDestino || null,
            estado: row.estado || null,
            falla: row.falla || null,
            etapa: row.etapa || null,
            resultadoDiagnostico: row.resultadoDiagnostico || null,
            elementosTransaccionados: row.elementosTransaccionados || 0,
            referenciaTransaccion: row.referenciaTransaccion || null,
            usuario: row.usuario || null,
            smartCardSerial: row.smartCardSerial || null,
            macAddress: row.macAddress || null,
            ibsAccountNumber: row.ibsAccountNumber || null,
            ridNumber: row.ridNumber || null,
            rawData: row.rawData || "{}",
          })),
        });
        imported += batch.length;
      } catch (e) {
        const msg = (e as Error).message?.slice(0, 300) || String(e);
        if (errors === 0) {
          // Log full first error for debugging
          console.error(`[REMANUFACTURA IMPORT] FIRST BATCH ERROR (batch ${Math.floor(i / BATCH_SIZE)}, rows ${i}-${i + batch.length}):`, msg);
          // Log first row of failed batch for diagnosis
          const sample = batch[0];
          console.error(`[REMANUFACTURA IMPORT] Sample row:`, JSON.stringify({
            importId: importRecord.id,
            source,
            fechaTransaccion: safeDate(sample.fechaTransaccion),
            numeroSerie: sample.numeroSerie,
            familiaEquipo: sample.familiaEquipo,
          }));
        }
        errors += batch.length;
      }

      // Log progress every 50k rows
      if ((i + BATCH_SIZE) % 50000 < BATCH_SIZE) {
        console.log(`[REMANUFACTURA IMPORT] Progress: ${Math.min(i + BATCH_SIZE, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
      }
    }

    // Update import record
    await prisma.remanufacturaImport.update({
      where: { id: importRecord.id },
      data: { importedRows: imported, errorRows: errors },
    });

    return NextResponse.json({
      importId: importRecord.id,
      source,
      totalRows: rows.length,
      imported,
      errors,
    });
  } catch (error) {
    console.error("[REMANUFACTURA IMPORT] ERROR:", error);
    return NextResponse.json(
      { error: `Error al importar: ${error instanceof Error ? error.message : "Error desconocido"}` },
      { status: 500 }
    );
  }
}

/**
 * GET: List import history
 */
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const imports = await prisma.remanufacturaImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(imports);
  } catch (error) {
    console.error("[REMANUFACTURA IMPORT] ERROR:", error);
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 500 });
  }
}

/**
 * DELETE: Remove an import and all its transactions
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get("importId");
    if (!importId) {
      return NextResponse.json({ error: "importId requerido" }, { status: 400 });
    }

    await prisma.remanufacturaTransaccion.deleteMany({ where: { importId } });
    await prisma.remanufacturaImport.delete({ where: { id: importId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[REMANUFACTURA DELETE] ERROR:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

function safeDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d;
}
