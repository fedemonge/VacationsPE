import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";
import { determineGestionables } from "@/lib/recupero/gestionable";
import { optimizeRoute, RouteConfig } from "@/lib/recupero/route-optimizer";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const sp = req.nextUrl.searchParams;
  const fecha = sp.get("fecha");
  const agenteId = sp.get("agenteId");
  const status = sp.get("status");

  const where: Record<string, unknown> = {};

  if (fecha) {
    const d = new Date(fecha);
    if (!isNaN(d.getTime())) {
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const startOfNextDay = new Date(startOfDay.getTime() + 86400000);
      where.fecha = { gte: startOfDay, lt: startOfNextDay };
    }
  }

  if (agenteId) {
    where.agenteId = agenteId;
  }

  if (status) {
    where.status = status;
  }

  const rutas = await prisma.rutaProgramacion.findMany({
    where,
    include: {
      agente: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rutas);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const body = await req.json();
  const { fecha, agenteIds } = body as { fecha: string; agenteIds: string[] };

  if (!fecha || !agenteIds || !Array.isArray(agenteIds) || agenteIds.length === 0) {
    return NextResponse.json(
      { error: "Se requiere fecha y agenteIds (array no vacío)" },
      { status: 400 }
    );
  }

  // Parse fecha as UTC to avoid timezone shifts
  const [yyyy, mm, dd] = fecha.split("-").map(Number);
  const targetDate = new Date(Date.UTC(yyyy, mm - 1, dd));
  console.log(`[RUTAS] Fecha recibida: "${fecha}" → targetDate: ${targetDate.toISOString()}`);
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // 1. Load all RutaConfig values into a map
  const configRows = await prisma.rutaConfig.findMany();
  const configMap = new Map<string, string>();
  for (const row of configRows) {
    configMap.set(row.key, row.value);
  }

  // 2. Load active RutaAgente records for requested IDs
  const agentes = await prisma.rutaAgente.findMany({
    where: {
      id: { in: agenteIds },
      isActive: true,
    },
  });

  if (agentes.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron agentes activos con los IDs proporcionados" },
      { status: 404 }
    );
  }

  // 3. Load ScoreAgendaRecord where fechaAgenda matches the target date (UTC)
  const startOfDay = new Date(Date.UTC(yyyy, mm - 1, dd));
  const startOfNextDay = new Date(startOfDay.getTime() + 86400000);

  console.log(`[RUTAS] Query agendas: fechaAgenda >= ${startOfDay.toISOString()} AND < ${startOfNextDay.toISOString()}`);
  const agendas = await prisma.scoreAgendaRecord.findMany({
    where: {
      fechaAgenda: {
        gte: startOfDay,
        lt: startOfNextDay,
      },
    },
  });
  console.log(`[RUTAS] Agendas encontradas: ${agendas.length}`);

  // 4. Load ClientDataRecord with valid coords in Peru
  // Newest imports first → wins deduplication, ensures recent records are prioritized
  const clientRecords = await prisma.clientDataRecord.findMany({
    where: { hasValidCoords: true, coordsInPeru: true },
    include: { import: { select: { receptionDate: true } } },
    orderBy: { import: { receptionDate: "desc" } },
  });

  // 5. Load all RecuperoTask records
  const recuperoTasks = await prisma.recuperoTask.findMany();

  // 6. Determine gestionables (agendadas + no-agendadas)
  const { gestionables } = determineGestionables(
    agendas,
    clientRecords,
    recuperoTasks,
    targetDate
  );

  const allAgendadas = gestionables.filter(v => v.esAgendada);
  const allNoAgendadas = gestionables.filter(v => !v.esAgendada);
  console.log(`[RUTAS] Agendadas: ${allAgendadas.length}, No-agendadas: ${allNoAgendadas.length}`);

  // 7. Assign each agendada to its nearest agent
  const agendadasPorAgente = new Map<string, typeof allAgendadas>();
  for (const agente of agentes) {
    agendadasPorAgente.set(agente.id, []);
  }

  for (const visit of allAgendadas) {
    let nearestAgenteId = agentes[0].id;
    let nearestDist = Infinity;
    for (const agente of agentes) {
      const dist = Math.sqrt(
        Math.pow(visit.lat - agente.latInicio, 2) + Math.pow(visit.lon - agente.lonInicio, 2)
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestAgenteId = agente.id;
      }
    }
    agendadasPorAgente.get(nearestAgenteId)!.push(visit);
  }

  for (const agente of agentes) {
    const assigned = agendadasPorAgente.get(agente.id) || [];
    console.log(`[RUTAS] Agente ${agente.nombre}: ${assigned.length} agendadas asignadas`);
  }

  // 7b. For each agent, optimize route and persist
  const results: Array<{
    id: string;
    agenteId: string;
    agenteNombre: string;
    fecha: Date;
    totalVisitas: number;
    totalDistanciaKm: number;
    totalTiempoMin: number;
    status: string;
    conflictos: Array<{ cliente: string; direccion: string; periodo: string; reason: string }>;
  }> = [];

  for (const agente of agentes) {
    // Agendadas asignadas a este agente + no-agendadas como pool para insertar
    const agenteAgendadas = agendadasPorAgente.get(agente.id) || [];
    const agenteVisits = [...agenteAgendadas, ...allNoAgendadas];

    const routeConfig: RouteConfig = {
      velocidadKmh: parseFloat(configMap.get("VELOCIDAD_PROMEDIO_KMH") || "25"),
      duracionVisitaMin: parseFloat(configMap.get("DURACION_VISITA_MIN") || "10"),
      distanciaMaximaKm: parseFloat(configMap.get("DISTANCIA_MAXIMA_KM") || "10"),
      periodoAM: {
        inicio: configMap.get("PERIODO_AM_INICIO") || "08:00",
        fin: configMap.get("PERIODO_AM_FIN") || "12:00",
      },
      periodoPM: {
        inicio: configMap.get("PERIODO_PM_INICIO") || "13:00",
        fin: configMap.get("PERIODO_PM_FIN") || "17:00",
      },
      puntoInicio: {
        lat: agente.latInicio,
        lon: agente.lonInicio,
      },
    };

    // Optimize route with this agent's assigned visits
    const optimized = optimizeRoute(agenteVisits, routeConfig);

    // Delete existing RutaProgramacion for this agent+fecha (re-generation)
    const existingRutas = await prisma.rutaProgramacion.findMany({
      where: {
        agenteId: agente.id,
        fecha: {
          gte: startOfDay,
          lt: startOfNextDay,
        },
      },
      select: { id: true },
    });

    if (existingRutas.length > 0) {
      const existingIds = existingRutas.map((r) => r.id);
      // Delete paradas first (cascade should handle it, but be explicit)
      await prisma.rutaParada.deleteMany({
        where: { rutaId: { in: existingIds } },
      });
      await prisma.rutaProgramacion.deleteMany({
        where: { id: { in: existingIds } },
      });
    }

    // Create RutaProgramacion record
    const ruta = await prisma.rutaProgramacion.create({
      data: {
        agenteId: agente.id,
        fecha: startOfDay,
        totalVisitas: optimized.totalVisitas,
        totalDistanciaKm: optimized.totalDistanciaKm,
        totalTiempoMin: optimized.totalTiempoMin,
        status: "GENERADA",
        generadoPorEmail: session.email,
      },
    });

    // Create RutaParada records in a transaction
    if (optimized.paradas.length > 0) {
      await prisma.$transaction(
        optimized.paradas.map((stop) =>
          prisma.rutaParada.create({
            data: {
              rutaId: ruta.id,
              secuencia: stop.secuencia,
              periodo: stop.periodo,
              esAgendada: stop.visit.esAgendada,
              sourceType: stop.visit.sourceType,
              sourceId: stop.visit.sourceId,
              sot: stop.visit.sot,
              codCliente: stop.visit.codCliente,
              cliente: stop.visit.cliente,
              direccion: stop.visit.direccion,
              distrito: stop.visit.distrito,
              departamento: stop.visit.departamento,
              latitud: stop.visit.lat,
              longitud: stop.visit.lon,
              telefono: stop.visit.telefono,
              distanciaDesdeAnteriorKm: stop.distanciaDesdeAnteriorKm,
              tiempoViajeMin: stop.tiempoViajeMin,
              duracionVisitaMin: stop.duracionVisitaMin,
              horaEstimadaLlegada: stop.horaEstimadaLlegada,
              horaEstimadaSalida: stop.horaEstimadaSalida,
            },
          })
        )
      );
    }

    results.push({
      id: ruta.id,
      agenteId: agente.id,
      agenteNombre: agente.nombre,
      fecha: ruta.fecha,
      totalVisitas: optimized.totalVisitas,
      totalDistanciaKm: optimized.totalDistanciaKm,
      totalTiempoMin: optimized.totalTiempoMin,
      status: ruta.status,
      conflictos: (optimized.conflictos || []).map((c) => ({
        cliente: c.visit.cliente || c.visit.codCliente || "—",
        direccion: c.visit.direccion || "—",
        periodo: c.periodo,
        reason: c.reason,
      })),
    });
  }

  const totalVisitas = results.reduce((s, r) => s + r.totalVisitas, 0);
  const totalDistanciaKm = results.reduce((s, r) => s + r.totalDistanciaKm, 0);
  const totalConflictos = results.reduce((s, r) => s + (r.conflictos?.length || 0), 0);
  const totalAgendadasInput = allAgendadas.length;
  const totalAgendadasRuteadas = totalAgendadasInput - totalConflictos;

  return NextResponse.json({
    rutas: results,
    totalVisitas,
    totalDistanciaKm,
    totalAgentes: results.length,
    totalConflictos,
    totalAgendadasInput,
    totalAgendadasRuteadas,
  }, { status: 201 });
}
