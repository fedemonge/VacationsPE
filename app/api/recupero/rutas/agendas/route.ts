import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";
import { parseScoreAgendas } from "@/lib/recupero/score-agenda-parser";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const imports = await prisma.scoreAgendaImport.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(imports);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    await ensureRecuperoTables();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { records, errors, totalRows } = parseScoreAgendas(buffer, file.name);

    if (records.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron registros en el archivo", errors },
        { status: 400 }
      );
    }

    // Create import record
    const importRecord = await prisma.scoreAgendaImport.create({
      data: {
        fileName: file.name,
        totalRows,
        importedRows: 0,
        errorRows: errors.length,
        importedByEmail: session.email,
        importedByName: session.email,
      },
    });

    // Batch insert records
    const BATCH_SIZE = 500;
    let imported = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((r) =>
          prisma.scoreAgendaRecord.create({
            data: {
              importId: importRecord.id,
              sot: r.sot,
              codCliente: r.codCliente,
              dni: r.dni,
              cliente: r.cliente,
              direccion: r.direccion,
              distrito: r.distrito,
              provincia: r.provincia,
              departamento: r.departamento,
              tipoBaja: r.tipoBaja,
              tecnologia: r.tecnologia,
              tipoAdquisicion: r.tipoAdquisicion,
              tipoProducto: r.tipoProducto,
              cantidadEquipos: r.cantidadEquipos,
              tipoBase: r.tipoBase,
              mesBase: r.mesBase,
              proyecto: r.proyecto,
              telefonoContactado: r.telefonoContactado,
              idCall: r.idCall,
              skill: r.skill,
              idAgente: r.idAgente,
              agenteNombre: r.agenteNombre,
              resultadoMarcacion: r.resultadoMarcacion,
              novedadGeneral: r.novedadGeneral,
              tipificacion: r.tipificacion,
              tipificacionHist: r.tipificacionHist,
              fechaGestion: r.fechaGestion,
              comentarios: r.comentarios,
              direccionActualizada: r.direccionActualizada,
              referencia: r.referencia,
              distritoAgenda: r.distritoAgenda,
              provinciaAgenda: r.provinciaAgenda,
              departamentoAgenda: r.departamentoAgenda,
              fechaAgenda: r.fechaAgenda,
              horarioAgenda: r.horarioAgenda,
              telefonoReferencia: r.telefonoReferencia,
              latitud: r.latitud,
              longitud: r.longitud,
              rangoHorario: r.rangoHorario,
              tipoAgenda: r.tipoAgenda,
              rawData: JSON.stringify(r.rawData),
            },
          })
        )
      );
      imported += batch.length;
    }

    // Update import record
    await prisma.scoreAgendaImport.update({
      where: { id: importRecord.id },
      data: { importedRows: imported },
    });

    // Gather summary stats
    const fechas = records
      .filter((r) => r.fechaAgenda)
      .map((r) => r.fechaAgenda!.toISOString().slice(0, 10));
    const uniqueFechas = Array.from(new Set(fechas)).sort();
    const agentesCC = Array.from(new Set(records.map((r) => r.agenteNombre).filter(Boolean)));
    const proyectos = Array.from(new Set(records.map((r) => r.proyecto).filter(Boolean)));
    const withCoords = records.filter((r) => r.latitud != null && r.longitud != null).length;

    return NextResponse.json({
      importId: importRecord.id,
      totalRows,
      imported,
      errorCount: errors.length,
      errorDetails: errors.slice(0, 100), // max 100 error details
      fechasAgenda: uniqueFechas,
      agentesCC: agentesCC.length,
      proyectos,
      withCoords,
      withoutCoords: imported - withCoords,
    });
  } catch (err) {
    console.error("[RUTAS] Import error:", err);
    return NextResponse.json(
      { error: `Error al importar: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
