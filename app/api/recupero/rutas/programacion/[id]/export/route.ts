import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";
import {
  generateRouteXLSX,
  generateRoutePDF,
  generateRouteCSV,
  ExportRuta,
  ExportParada,
} from "@/lib/recupero/route-exports";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") || "xlsx").toLowerCase();
  const configId = sp.get("configId");

  if (!["pdf", "xlsx", "csv", "txt"].includes(format)) {
    return NextResponse.json(
      { error: "Formato no soportado. Use: pdf, xlsx, csv, txt" },
      { status: 400 }
    );
  }

  // Load the route with paradas and agent
  const ruta = await prisma.rutaProgramacion.findUnique({
    where: { id },
    include: {
      agente: true,
      paradas: {
        orderBy: { secuencia: "asc" },
      },
    },
  });

  if (!ruta) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  // Build ExportRuta
  const exportRuta: ExportRuta = {
    agente: ruta.agente.nombre,
    fecha: ruta.fecha.toISOString().split("T")[0],
    puntoInicio: { lat: ruta.agente.latInicio, lon: ruta.agente.lonInicio },
    totalVisitas: ruta.totalVisitas,
    totalDistanciaKm: ruta.totalDistanciaKm,
    totalTiempoMin: ruta.totalTiempoMin,
    paradas: ruta.paradas.map((p): ExportParada => ({
      secuencia: p.secuencia,
      periodo: p.periodo,
      esAgendada: p.esAgendada,
      sot: p.sot,
      codCliente: p.codCliente,
      cliente: p.cliente,
      direccion: p.direccion,
      distrito: p.distrito,
      departamento: p.departamento,
      latitud: p.latitud,
      longitud: p.longitud,
      telefono: p.telefono,
      distanciaDesdeAnteriorKm: p.distanciaDesdeAnteriorKm,
      tiempoViajeMin: p.tiempoViajeMin,
      duracionVisitaMin: p.duracionVisitaMin,
      horaEstimadaLlegada: p.horaEstimadaLlegada,
      horaEstimadaSalida: p.horaEstimadaSalida,
    })),
  };

  const dateStr = exportRuta.fecha.replace(/-/g, "");
  const agentSlug = exportRuta.agente.replace(/\s+/g, "_");

  // Generate and return based on format
  if (format === "xlsx") {
    const buf = generateRouteXLSX([exportRuta]);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ruta_${agentSlug}_${dateStr}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buf = generateRoutePDF([exportRuta]);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ruta_${agentSlug}_${dateStr}.pdf"`,
      },
    });
  }

  // CSV or TXT — load export config
  let fieldOrder: string[];
  let delimiter: string;

  if (configId) {
    const config = await prisma.rutaExportConfig.findUnique({
      where: { id: configId },
    });
    if (!config) {
      return NextResponse.json(
        { error: "Configuracion de exportacion no encontrada" },
        { status: 404 }
      );
    }
    fieldOrder = JSON.parse(config.fieldOrder);
    delimiter = config.delimiter;
  } else {
    // Load default config
    const defaultConfig = await prisma.rutaExportConfig.findFirst({
      where: { isDefault: true },
    });
    if (defaultConfig) {
      fieldOrder = JSON.parse(defaultConfig.fieldOrder);
      delimiter = defaultConfig.delimiter;
    } else {
      // Fallback
      fieldOrder = [
        "secuencia", "periodo", "sot", "codCliente", "cliente", "direccion",
        "distrito", "departamento", "latitud", "longitud", "telefono",
        "distanciaDesdeAnteriorKm", "tiempoViajeMin", "duracionVisitaMin",
        "horaEstimadaLlegada", "horaEstimadaSalida", "esAgendada",
      ];
      delimiter = format === "txt" ? "\t" : ",";
    }
  }

  // Override delimiter for TXT if not explicitly configured
  if (format === "txt" && !configId) {
    delimiter = "\t";
  }

  const csvContent = generateRouteCSV(exportRuta, fieldOrder, delimiter);
  const ext = format === "txt" ? "txt" : "csv";
  const contentType = format === "txt" ? "text/plain" : "text/csv";

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="ruta_${agentSlug}_${dateStr}.${ext}"`,
    },
  });
}
