import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";
import {
  generateRouteXLSX,
  generateRoutePDF,
  ExportRuta,
  ExportParada,
} from "@/lib/recupero/route-exports";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const sp = req.nextUrl.searchParams;
  const fecha = sp.get("fecha");
  const format = (sp.get("format") || "xlsx").toLowerCase();

  if (!fecha) {
    return NextResponse.json(
      { error: "Se requiere el parametro fecha (ISO date)" },
      { status: 400 }
    );
  }

  if (!["pdf", "xlsx"].includes(format)) {
    return NextResponse.json(
      { error: "Formato no soportado para export-all. Use: pdf, xlsx" },
      { status: 400 }
    );
  }

  const d = new Date(fecha);
  if (isNaN(d.getTime())) {
    return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
  }

  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfNextDay = new Date(startOfDay.getTime() + 86400000);

  // Load all routes for the date with paradas and agent
  const rutas = await prisma.rutaProgramacion.findMany({
    where: {
      fecha: {
        gte: startOfDay,
        lt: startOfNextDay,
      },
    },
    include: {
      agente: true,
      paradas: {
        orderBy: { secuencia: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (rutas.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron rutas para la fecha indicada" },
      { status: 404 }
    );
  }

  // Build ExportRuta array
  const exportRutas: ExportRuta[] = rutas.map((ruta) => ({
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
  }));

  const dateStr = fecha.replace(/-/g, "");

  if (format === "xlsx") {
    const buf = generateRouteXLSX(exportRutas);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rutas_${dateStr}_todos.xlsx"`,
      },
    });
  }

  // PDF
  const buf = generateRoutePDF(exportRutas);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rutas_${dateStr}_todos.pdf"`,
    },
  });
}
