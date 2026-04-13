import { prisma } from "@/lib/prisma";
import { FAULT_CODES } from "./types";

/** Standard filter set used across all analysis functions */
export interface RemanufacturaFilterSet {
  source?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  familiaEquipo?: string;
  cliente?: string;      // orgOrigen (CLARO, DTV, WOW, INTEGRATEL, etc.)
  anio?: number;         // year filter
  mes?: number;          // month filter (1-12)
}

// Data sourcing rule: OSCM up to June 30, 2025; WMS from July 1, 2025 onwards.
// When no source is explicitly selected, exclude the non-preferred source per period
// to avoid double-counting. Iteration/history analysis uses all records (pass source explicitly).
const SOURCE_CUTOFF = new Date(Date.UTC(2025, 6, 1)); // July 1, 2025
const SOURCE_CUTOFF_MS = SOURCE_CUTOFF.getTime();

function applySourceRule(where: Record<string, unknown>, filters: RemanufacturaFilterSet) {
  if (filters.source) {
    where.source = filters.source;
  } else {
    where.OR = [
      { fechaTransaccion: { lt: SOURCE_CUTOFF }, source: "OSCM" },
      { fechaTransaccion: { gte: SOURCE_CUTOFF }, source: "WMS" },
    ];
  }
}

function applySourceRuleRaw(conditions: string[], params: unknown[], filters: RemanufacturaFilterSet) {
  if (filters.source) {
    conditions.push(`"source" = ?`);
    params.push(filters.source);
  } else {
    conditions.push(`(("fechaTransaccion" < ? AND "source" = 'OSCM') OR ("fechaTransaccion" >= ? AND "source" = 'WMS'))`);
    params.push(SOURCE_CUTOFF_MS, SOURCE_CUTOFF_MS);
  }
}

/** Build Prisma where clause from standard filters */
function buildWhere(filters: RemanufacturaFilterSet): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  applySourceRule(where, filters);
  if (filters.familiaEquipo) {
    if (filters.familiaEquipo.includes(",")) {
      where.familiaEquipo = { in: filters.familiaEquipo.split(",") };
    } else {
      where.familiaEquipo = filters.familiaEquipo;
    }
  }
  if (filters.cliente) where.clienteNormalizado = filters.cliente;

  // Date range: year/month takes precedence, explicit dates override
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (filters.anio && filters.mes) {
    gte = new Date(Date.UTC(filters.anio, filters.mes - 1, 1));
    lte = new Date(Date.UTC(filters.anio, filters.mes, 0, 23, 59, 59));
  } else if (filters.anio) {
    gte = new Date(Date.UTC(filters.anio, 0, 1));
    lte = new Date(Date.UTC(filters.anio, 11, 31, 23, 59, 59));
  }

  if (filters.fechaDesde) gte = new Date(filters.fechaDesde);
  if (filters.fechaHasta) lte = new Date(filters.fechaHasta);

  if (gte || lte) {
    const dateFilter: Record<string, unknown> = {};
    if (gte) dateFilter.gte = gte;
    if (lte) dateFilter.lte = lte;
    where.fechaTransaccion = dateFilter;
  }

  return where;
}

/** Build raw SQL conditions WITHOUT source rule (for iteration history across both sources) */
function buildRawWhereNoSource(filters: RemanufacturaFilterSet): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [`"numeroSerie" IS NOT NULL`];
  const params: unknown[] = [];
  if (filters.source) { conditions.push(`"source" = ?`); params.push(filters.source); }
  if (filters.familiaEquipo) {
    if (filters.familiaEquipo.includes(",")) {
      const vals = filters.familiaEquipo.split(",");
      conditions.push(`"familiaEquipo" IN (${vals.map(() => "?").join(",")})`);
      params.push(...vals);
    } else {
      conditions.push(`"familiaEquipo" = ?`);
      params.push(filters.familiaEquipo);
    }
  }
  if (filters.cliente) { conditions.push(`"clienteNormalizado" = ?`); params.push(filters.cliente); }
  let gteMs: number | undefined;
  let lteMs: number | undefined;
  if (filters.anio && filters.mes) {
    gteMs = new Date(Date.UTC(filters.anio, filters.mes - 1, 1)).getTime();
    lteMs = new Date(Date.UTC(filters.anio, filters.mes, 0, 23, 59, 59)).getTime();
  } else if (filters.anio) {
    gteMs = new Date(Date.UTC(filters.anio, 0, 1)).getTime();
    lteMs = new Date(Date.UTC(filters.anio, 11, 31, 23, 59, 59)).getTime();
  }
  if (filters.fechaDesde) gteMs = new Date(filters.fechaDesde).getTime();
  if (filters.fechaHasta) lteMs = new Date(filters.fechaHasta + "T23:59:59").getTime();
  if (gteMs) { conditions.push(`"fechaTransaccion" >= ?`); params.push(gteMs); }
  if (lteMs) { conditions.push(`"fechaTransaccion" <= ?`); params.push(lteMs); }
  return { conditions, params };
}

/**
 * Build the SQL condition for cycle-entry events.
 * DirecTV cycle entry:
 *   - 'Recepciones Varias' or 'Transferencia Directa Entre Organizaciones' to orgDestino IQREC00*
 *   - 'Recepción en tránsito' from orgOrigen IQREC00*
 * Other clients: INGRESO etapa with 'Recepciones varias'.
 * WMS (all clients): DIAGNOSTICO etapa.
 */
function buildCycleEntrySQL(filters: RemanufacturaFilterSet): string {
  if (filters.cliente === 'DIRECTV') {
    return `(
      ("tipoTransaccion" IN ('Recepciones Varias', 'Recepciones varias', 'Transferencia Directa Entre Organizaciones') AND "orgDestino" LIKE 'IQREC00%')
      OR ("tipoTransaccion" = 'Recepción en tránsito' AND "orgOrigen" LIKE 'IQREC00%')
      OR ("source" = 'WMS' AND "etapa" = 'DIAGNOSTICO')
    )`;
  }
  // Non-DirecTV or all-clients view: include both DirecTV + legacy logic
  return `(
    ("tipoTransaccion" IN ('Recepciones Varias', 'Recepciones varias', 'Transferencia Directa Entre Organizaciones') AND "orgDestino" LIKE 'IQREC00%')
    OR ("tipoTransaccion" = 'Recepción en tránsito' AND "orgOrigen" LIKE 'IQREC00%')
    OR ("etapa" = 'INGRESO' AND "tipoTransaccion" = 'Recepciones varias')
    OR ("source" = 'WMS' AND "etapa" = 'DIAGNOSTICO')
  )`;
}

/** Build raw SQL with source rule + client but NO date range and NO familia (for cycle counting across full history).
 *  Familia filter is resolved separately via Prisma ORM to get a serial allowlist. */
function buildRawWhereForCycles(filters: RemanufacturaFilterSet): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [`"numeroSerie" IS NOT NULL`];
  const params: unknown[] = [];
  applySourceRuleRaw(conditions, params, filters);
  // No clienteNormalizado filter — serial may have records under different client names across its lifecycle
  // No familiaEquipo filter — some cycle entries have NULL familia
  // No date range filter — need full history for accurate cycle count
  // Client + familia filtering done in JS via getSerialsByFamilia
  return { conditions, params };
}

/** Get serials that match the familia filter (for cycle queries) */
async function getSerialsByFamilia(filters: RemanufacturaFilterSet): Promise<string[] | null> {
  if (!filters.familiaEquipo) return null;
  const familias = filters.familiaEquipo.includes(",") ? filters.familiaEquipo.split(",") : [filters.familiaEquipo];
  const where: Record<string, unknown> = {
    numeroSerie: { not: null },
    familiaEquipo: { in: familias },
  };
  if (filters.cliente) where.clienteNormalizado = filters.cliente;
  const result = await prisma.remanufacturaTransaccion.findMany({
    where,
    select: { numeroSerie: true },
    distinct: ["numeroSerie"],
  });
  return result.map((r) => r.numeroSerie!);
}

/** Build raw SQL conditions + params from filters (with source rule) */
function buildRawWhere(filters: RemanufacturaFilterSet): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [`"numeroSerie" IS NOT NULL`];
  const params: unknown[] = [];

  applySourceRuleRaw(conditions, params, filters);
  if (filters.familiaEquipo) {
    if (filters.familiaEquipo.includes(",")) {
      const vals = filters.familiaEquipo.split(",");
      const placeholders = vals.map(() => "?").join(",");
      conditions.push(`"familiaEquipo" IN (${placeholders})`);
      params.push(...vals);
    } else {
      conditions.push(`"familiaEquipo" = ?`);
      params.push(filters.familiaEquipo);
    }
  }
  if (filters.cliente) { conditions.push(`"clienteNormalizado" = ?`); params.push(filters.cliente); }

  // fechaTransaccion is stored as epoch milliseconds — compare with epoch values
  let gteMs: number | undefined;
  let lteMs: number | undefined;
  if (filters.anio && filters.mes) {
    gteMs = new Date(Date.UTC(filters.anio, filters.mes - 1, 1)).getTime();
    lteMs = new Date(Date.UTC(filters.anio, filters.mes, 0, 23, 59, 59)).getTime();
  } else if (filters.anio) {
    gteMs = new Date(Date.UTC(filters.anio, 0, 1)).getTime();
    lteMs = new Date(Date.UTC(filters.anio, 11, 31, 23, 59, 59)).getTime();
  }
  if (filters.fechaDesde) gteMs = new Date(filters.fechaDesde).getTime();
  if (filters.fechaHasta) lteMs = new Date(filters.fechaHasta + "T23:59:59").getTime();

  if (gteMs) { conditions.push(`"fechaTransaccion" >= ?`); params.push(gteMs); }
  if (lteMs) { conditions.push(`"fechaTransaccion" <= ?`); params.push(lteMs); }

  return { conditions, params };
}

/** Parse filters from URL search params */
export function parseFilters(searchParams: URLSearchParams): RemanufacturaFilterSet {
  return {
    source: searchParams.get("source") || undefined,
    fechaDesde: searchParams.get("fechaDesde") || undefined,
    fechaHasta: searchParams.get("fechaHasta") || undefined,
    familiaEquipo: searchParams.get("familiaEquipo") || undefined,
    cliente: searchParams.get("cliente") || undefined,
    anio: searchParams.get("anio") ? parseInt(searchParams.get("anio")!, 10) : undefined,
    mes: searchParams.get("mes") ? parseInt(searchParams.get("mes")!, 10) : undefined,
  };
}

/**
 * Get distinct clients and available years for filter dropdowns
 */
export async function getFilterOptions() {
  const [clienteGroups, fechaRange] = await Promise.all([
    prisma.remanufacturaTransaccion.groupBy({
      by: ["clienteNormalizado"],
      where: { clienteNormalizado: { not: null } },
      _count: true,
      orderBy: { _count: { clienteNormalizado: "desc" } },
    }),
    prisma.remanufacturaTransaccion.aggregate({
      _min: { fechaTransaccion: true },
      _max: { fechaTransaccion: true },
    }),
  ]);

  const clientes = clienteGroups.map((g) => ({
    nombre: g.clienteNormalizado || "Desconocido",
    cantidad: g._count,
  }));

  const minDate = fechaRange._min.fechaTransaccion;
  const maxDate = fechaRange._max.fechaTransaccion;
  const minYear = minDate ? new Date(minDate).getFullYear() : new Date().getFullYear();
  const maxYear = maxDate ? new Date(maxDate).getFullYear() : new Date().getFullYear();
  const anios: number[] = [];
  for (let y = minYear; y <= maxYear; y++) anios.push(y);

  const maxMonth = maxDate ? new Date(maxDate).getMonth() + 1 : undefined;

  return { clientes, anios, maxMonth, maxYear };
}

/**
 * Get general KPI stats
 */
export async function getRemanufacturaStats(filters: RemanufacturaFilterSet) {
  const where = buildWhere(filters);

  const [
    totalTransacciones, totalOSCM, totalWMS,
    sinFalla, conFalla, familiaGroups, seriesUnicas,
  ] = await Promise.all([
    prisma.remanufacturaTransaccion.count({ where }),
    prisma.remanufacturaTransaccion.count({ where: { ...where, source: "OSCM" } }),
    prisma.remanufacturaTransaccion.count({ where: { ...where, source: "WMS" } }),
    prisma.remanufacturaTransaccion.count({ where: { ...where, resultadoDiagnostico: "SIN_FALLA" } }),
    prisma.remanufacturaTransaccion.count({ where: { ...where, resultadoDiagnostico: "CON_FALLA" } }),
    prisma.remanufacturaTransaccion.groupBy({
      by: ["familiaEquipo"],
      where: { ...where, familiaEquipo: { not: null } },
      _count: true,
    }),
    prisma.remanufacturaTransaccion.groupBy({
      by: ["numeroSerie"],
      where: { ...where, numeroSerie: { not: null } },
    }),
  ]);

  const totalDiagnosticados = sinFalla + conFalla;

  return {
    totalTransacciones,
    totalEquiposUnicos: seriesUnicas.length,
    totalOSCM,
    totalWMS,
    porFamilia: familiaGroups.map((g) => ({
      familia: g.familiaEquipo || "Sin clasificar",
      cantidad: g._count,
    })),
    sinFalla,
    conFalla,
    porcentajeSinFalla: totalDiagnosticados > 0 ? Math.round((sinFalla / totalDiagnosticados) * 1000) / 10 : 0,
  };
}

/**
 * Monthly diagnostics breakdown (sin falla vs con falla by month)
 */
export async function getMonthlyDiagnostics(filters: RemanufacturaFilterSet) {
  const { conditions, params } = buildRawWhere(filters);
  const whereClause = conditions.join(" AND ");

  const result = await prisma.$queryRawUnsafe<{
    ym: string; sinFalla: number; conFalla: number; sinDiagnostico: number;
  }[]>(`
    SELECT
      strftime('%Y-%m', datetime("fechaTransaccion"/1000, 'unixepoch')) as ym,
      SUM(CASE WHEN "resultadoDiagnostico" = 'SIN_FALLA' THEN 1 ELSE 0 END) as sinFalla,
      SUM(CASE WHEN "resultadoDiagnostico" = 'CON_FALLA' THEN 1 ELSE 0 END) as conFalla,
      SUM(CASE WHEN "resultadoDiagnostico" IS NULL THEN 1 ELSE 0 END) as sinDiagnostico
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause} AND "fechaTransaccion" IS NOT NULL
    GROUP BY ym
    HAVING ym IS NOT NULL
    ORDER BY ym ASC
  `, ...params);

  const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return result
    .filter((r) => r.ym != null)
    .map((r) => {
      const [y, m] = r.ym.split("-");
      return {
        mes: `${MONTH_NAMES[parseInt(m, 10)]} ${y}`,
        sinFalla: Number(r.sinFalla),
        conFalla: Number(r.conFalla),
        sinDiagnostico: Number(r.sinDiagnostico),
      };
    });
}

/**
 * Iteration analysis — counts refurbishment cycles per serial.
 * A cycle = a distinct date with a cycle-entry event (see buildCycleEntrySQL):
 *   - DirecTV: transaction type 'Recepciones Varias' or 'Transferencia Directa Entre Organizaciones'
 *     with orgDestino starting with 'IQREC00'
 *   - Other clients: etapa INGRESO with 'Recepciones varias'
 *   - WMS: DIAGNOSTICO etapa
 * Source rule: OSCM before Jul 2025, WMS from Jul 2025. No exceptions.
 */
export async function getIterationAnalysis(filters: RemanufacturaFilterSet) {
  const { conditions, params } = buildRawWhereForCycles(filters);

  // Get allowed serials by familia (if filter set)
  const allowedSerials = await getSerialsByFamilia(filters);
  if (allowedSerials !== null) {
    // Use a temp approach: filter in JS after getting all cycles (raw SQL IN with 50K+ serials won't work)
  }

  const whereClause = conditions.join(" AND ");

  const rawCycles = await prisma.$queryRawUnsafe<{ numeroSerie: string; cycles: number }[]>(`
    SELECT "numeroSerie",
      COUNT(DISTINCT strftime('%Y-%m-%d', datetime("fechaTransaccion"/1000, 'unixepoch'))) as cycles
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND ${buildCycleEntrySQL(filters)}
    GROUP BY "numeroSerie"
  `, ...params);

  // Filter by familia if needed
  const allowedSet = allowedSerials ? new Set(allowedSerials) : null;
  const filtered = allowedSet ? rawCycles.filter((r) => allowedSet.has(r.numeroSerie)) : rawCycles;

  // Aggregate into cycle buckets
  const buckets = new Map<number, number>();
  for (const r of filtered) {
    const c = Number(r.cycles);
    buckets.set(c, (buckets.get(c) || 0) + 1);
  }

  const total = filtered.length;
  const result = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  return result.map(([cycles, count]) => ({
    iteracion: cycles,
    cantidad: count,
    porcentaje: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));
}

/**
 * Get sample serials for a given cycle count (top 20)
 */
export async function getIterationDetail(filters: RemanufacturaFilterSet, iteracion: number) {
  const { conditions, params } = buildRawWhereForCycles(filters);
  const whereClause = conditions.join(" AND ");
  const srcRule = `(("fechaTransaccion" < ${SOURCE_CUTOFF_MS} AND "source" = 'OSCM') OR ("fechaTransaccion" >= ${SOURCE_CUTOFF_MS} AND "source" = 'WMS'))`;

  // Get all serials with their cycle counts
  const allCycles = await prisma.$queryRawUnsafe<{ numeroSerie: string; cycles: number; firstSeen: number; lastSeen: number }[]>(`
    SELECT "numeroSerie",
      COUNT(DISTINCT strftime('%Y-%m-%d', datetime("fechaTransaccion"/1000, 'unixepoch'))) as cycles,
      MIN("fechaTransaccion") as firstSeen, MAX("fechaTransaccion") as lastSeen
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND ${buildCycleEntrySQL(filters)}
    GROUP BY "numeroSerie"
    HAVING cycles = ?
  `, ...params, iteracion);

  // Filter by familia
  const allowedSerials = await getSerialsByFamilia(filters);
  const allowedSet = allowedSerials ? new Set(allowedSerials) : null;
  const matching = (allowedSet ? allCycles.filter((r) => allowedSet.has(r.numeroSerie)) : allCycles).slice(0, 20);

  // Get latest record for each serial
  const result: { numeroSerie: string; cycles: number; familiaEquipo: string | null; falla: string | null; resultadoDiagnostico: string | null; firstSeen: number; lastSeen: number }[] = [];
  for (const s of matching) {
    const latest = await prisma.remanufacturaTransaccion.findFirst({
      where: {
        numeroSerie: s.numeroSerie,
        OR: [
          { fechaTransaccion: { lt: SOURCE_CUTOFF }, source: "OSCM" },
          { fechaTransaccion: { gte: SOURCE_CUTOFF }, source: "WMS" },
        ],
      },
      orderBy: { fechaTransaccion: "desc" },
      select: { familiaEquipo: true, falla: true, resultadoDiagnostico: true },
    });
    result.push({ ...s, familiaEquipo: latest?.familiaEquipo || null, falla: latest?.falla || null, resultadoDiagnostico: latest?.resultadoDiagnostico || null });
  }

  return result.map((r) => ({
    numeroSerie: r.numeroSerie,
    iteraciones: Number((r as any).iterations || r.cycles),
    familia: r.familiaEquipo || "—",
    ultimaFalla: r.resultadoDiagnostico === "SIN_FALLA" ? "—" : r.falla ? (FAULT_CODES[r.falla] || r.falla) : "—",
    ultimoDiagnostico: r.resultadoDiagnostico || "—",
    primerIngreso: r.firstSeen ? new Date(Number(r.firstSeen)).toISOString().split("T")[0] : "—",
    ultimoIngreso: r.lastSeen ? new Date(Number(r.lastSeen)).toISOString().split("T")[0] : "—",
  }));
}

/**
 * Fault type distribution
 */
export async function getFaultAnalysis(filters: RemanufacturaFilterSet & { etapa?: string; resultadoDiagnostico?: string }) {
  const where = buildWhere(filters);
  where.falla = { not: null };
  if (filters.etapa) where.etapa = filters.etapa;
  if (filters.resultadoDiagnostico) where.resultadoDiagnostico = filters.resultadoDiagnostico;
  else where.resultadoDiagnostico = { not: null };

  const groups = await prisma.remanufacturaTransaccion.groupBy({
    by: ["falla"],
    where,
    _count: true,
    orderBy: { _count: { falla: "desc" } },
  });

  const total = groups.reduce((sum, g) => sum + g._count, 0);

  return groups.map((g) => ({
    falla: g.falla || "DESCONOCIDA",
    fallaDescripcion: FAULT_CODES[g.falla || ""] || g.falla || "Desconocida",
    cantidad: g._count,
    porcentaje: total > 0 ? Math.round((g._count / total) * 1000) / 10 : 0,
  }));
}

/**
 * Fault by iteration breakdown
 * Uses INGRESO cycle numbering. Simplified: assigns cycle number to each diagnosis
 * event based on DENSE_RANK of INGRESO dates for the same serial.
 */
export async function getFaultByIterationAnalysis(filters: RemanufacturaFilterSet) {
  // Step 1 uses full history (no date range) for accurate cycle counts
  const { conditions: cycleConditions, params: cycleParams } = buildRawWhereForCycles(filters);
  const cycleWhereClause = cycleConditions.join(" AND ");
  // Step 2 uses date-filtered data for diagnosis breakdown
  const { conditions, params } = buildRawWhere(filters);
  const whereClause = conditions.join(" AND ");

  // Step 1: Get cycle counts per serial + filter by familia via JS
  const [rawCycleData, allowedSerials] = await Promise.all([
    prisma.$queryRawUnsafe<{ numeroSerie: string; cycles: number }[]>(`
      SELECT "numeroSerie",
        COUNT(DISTINCT strftime('%Y-%m-%d', datetime("fechaTransaccion"/1000, 'unixepoch'))) as cycles
      FROM "RemanufacturaTransaccion"
      WHERE ${cycleWhereClause}
        AND ${buildCycleEntrySQL(filters)}
      GROUP BY "numeroSerie"
    `, ...cycleParams),
    getSerialsByFamilia(filters),
  ]);

  const allowedSet = allowedSerials ? new Set(allowedSerials) : null;
  const cycleData = allowedSet ? rawCycleData.filter((r) => allowedSet.has(r.numeroSerie)) : rawCycleData;

  const serialCycles = new Map(cycleData.map((r) => [r.numeroSerie, Number(r.cycles)]));

  // Step 2: Get diagnosis aggregated by serial (same source rule already in whereClause)
  const diagAgg = await prisma.$queryRawUnsafe<{
    numeroSerie: string; resultadoDiagnostico: string; falla: string | null; cnt: number;
  }[]>(`
    SELECT "numeroSerie", "resultadoDiagnostico", "falla", COUNT(*) as cnt
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND "resultadoDiagnostico" IS NOT NULL
    GROUP BY "numeroSerie", "resultadoDiagnostico", "falla"
  `, ...params);

  // Step 3: Map diagnosis to cycle counts
  const byIter = new Map<number, { sinFalla: number; conFalla: number; fallas: Map<string, number> }>();
  for (const row of diagAgg) {
    const cycles = serialCycles.get(row.numeroSerie);
    if (!cycles) continue;
    const cnt = Number(row.cnt);
    if (!byIter.has(cycles)) byIter.set(cycles, { sinFalla: 0, conFalla: 0, fallas: new Map() });
    const entry = byIter.get(cycles)!;
    if (row.resultadoDiagnostico === "SIN_FALLA") entry.sinFalla += cnt;
    else if (row.resultadoDiagnostico === "CON_FALLA") entry.conFalla += cnt;
    if (row.falla && row.falla !== "SF" && row.resultadoDiagnostico !== "SIN_FALLA") {
      entry.fallas.set(row.falla, (entry.fallas.get(row.falla) || 0) + cnt);
    }
  }

  return Array.from(byIter.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, 25)
    .map(([iteracion, data]) => {
      const totalFallas = data.conFalla;
      const fallas = Array.from(data.fallas.entries())
        .map(([falla, cantidad]) => ({
          falla,
          fallaDescripcion: FAULT_CODES[falla] || falla,
          cantidad,
          porcentaje: totalFallas > 0 ? Math.round((cantidad / totalFallas) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.cantidad - a.cantidad);
      return { iteracion, fallas, totalSinFalla: data.sinFalla, totalConFalla: data.conFalla };
    });
}

/**
 * Family distribution
 */
export async function getFamilyAnalysis(filters: RemanufacturaFilterSet) {
  const where = buildWhere(filters);
  where.numeroSerie = { not: null };

  const groups = await prisma.remanufacturaTransaccion.groupBy({
    by: ["familiaEquipo"],
    where,
    _count: true,
    orderBy: { _count: { familiaEquipo: "desc" } },
  });

  const total = groups.reduce((sum, g) => sum + g._count, 0);
  return groups.map((g) => ({
    familia: g.familiaEquipo || "Sin clasificar",
    cantidad: g._count,
    porcentaje: total > 0 ? Math.round((g._count / total) * 1000) / 10 : 0,
  }));
}

/**
 * Transaction type distribution
 */
export async function getTransactionTypeAnalysis(filters: RemanufacturaFilterSet) {
  const where = buildWhere(filters);
  where.tipoTransaccion = { not: null };

  const groups = await prisma.remanufacturaTransaccion.groupBy({
    by: ["tipoTransaccion"],
    where,
    _count: true,
    orderBy: { _count: { tipoTransaccion: "desc" } },
  });

  return groups.map((g) => ({
    tipo: g.tipoTransaccion || "Sin tipo",
    cantidad: g._count,
  }));
}

// Scrap transaction types
const SCRAP_TYPES = ["SCRAP", "SC-SCRAP", "SCRAP ESTRATEGICO", "RAEE"];

/**
 * Scrap analysis by period (monthly)
 */
export async function getScrapByPeriod(filters: RemanufacturaFilterSet) {
  const { conditions, params } = buildRawWhere(filters);
  const whereClause = conditions.join(" AND ");

  const result = await prisma.$queryRawUnsafe<{
    ym: string; scrap: number; scrapEstrategico: number; raee: number; scSCrap: number;
  }[]>(`
    SELECT
      strftime('%Y-%m', datetime("fechaTransaccion"/1000, 'unixepoch')) as ym,
      SUM(CASE WHEN "tipoTransaccion" = 'SCRAP' THEN 1 ELSE 0 END) as scrap,
      SUM(CASE WHEN "tipoTransaccion" = 'SCRAP ESTRATEGICO' THEN 1 ELSE 0 END) as scrapEstrategico,
      SUM(CASE WHEN "tipoTransaccion" = 'RAEE' THEN 1 ELSE 0 END) as raee,
      SUM(CASE WHEN "tipoTransaccion" = 'SC-SCRAP' THEN 1 ELSE 0 END) as scSCrap
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND "tipoTransaccion" IN ('SCRAP', 'SC-SCRAP', 'SCRAP ESTRATEGICO', 'RAEE')
      AND "fechaTransaccion" IS NOT NULL
    GROUP BY ym
    HAVING ym IS NOT NULL
    ORDER BY ym ASC
  `, ...params);

  const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return result.map((r) => {
    const [y, m] = r.ym.split("-");
    return {
      mes: `${MONTH_NAMES[parseInt(m, 10)]} ${y}`,
      scrap: Number(r.scrap),
      scrapEstrategico: Number(r.scrapEstrategico),
      raee: Number(r.raee),
      scSCrap: Number(r.scSCrap),
      total: Number(r.scrap) + Number(r.scrapEstrategico) + Number(r.raee) + Number(r.scSCrap),
    };
  });
}

/**
 * Scrap analysis by iteration (how many cycles before being scrapped)
 */
export async function getScrapByIteration(filters: RemanufacturaFilterSet) {
  const { conditions, params } = buildRawWhereForCycles(filters);
  const whereClause = conditions.join(" AND ");

  // Step 1: Get all cycle counts (no client/familia filter)
  const rawCycles = await prisma.$queryRawUnsafe<{ numeroSerie: string; cycles: number }[]>(`
    SELECT "numeroSerie",
      COUNT(DISTINCT strftime('%Y-%m-%d', datetime("fechaTransaccion"/1000, 'unixepoch'))) as cycles
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND ${buildCycleEntrySQL(filters)}
    GROUP BY "numeroSerie"
  `, ...params);

  const serialCycleMap = new Map(rawCycles.map((r) => [r.numeroSerie, Number(r.cycles)]));

  // Step 2: Get scrapped serials (from source-rule-filtered data)
  const { conditions: srcConditions, params: srcParams } = buildRawWhere(filters);
  const srcWhereClause = srcConditions.join(" AND ");

  const scrappedSerials = await prisma.$queryRawUnsafe<{ numeroSerie: string; tipoTransaccion: string }[]>(`
    SELECT DISTINCT "numeroSerie", "tipoTransaccion"
    FROM "RemanufacturaTransaccion"
    WHERE ${srcWhereClause}
      AND "tipoTransaccion" IN ('SCRAP', 'SC-SCRAP', 'SCRAP ESTRATEGICO', 'RAEE')
  `, ...srcParams);

  // Step 3: Filter by familia
  const allowedSerials = await getSerialsByFamilia(filters);
  const allowedSet = allowedSerials ? new Set(allowedSerials) : null;

  // Step 4: Group scrapped serials by cycle count
  const byIter = new Map<number, { scrap: number; scrapEstrategico: number; raee: number; scSCrap: number }>();
  let totalScrapped = 0;

  for (const row of scrappedSerials) {
    if (allowedSet && !allowedSet.has(row.numeroSerie)) continue;
    const cycles = serialCycleMap.get(row.numeroSerie) || 0;
    if (!byIter.has(cycles)) byIter.set(cycles, { scrap: 0, scrapEstrategico: 0, raee: 0, scSCrap: 0 });
    const entry = byIter.get(cycles)!;
    if (row.tipoTransaccion === "SCRAP") entry.scrap++;
    else if (row.tipoTransaccion === "SCRAP ESTRATEGICO") entry.scrapEstrategico++;
    else if (row.tipoTransaccion === "RAEE") entry.raee++;
    else if (row.tipoTransaccion === "SC-SCRAP") entry.scSCrap++;
    totalScrapped++;
  }

  return {
    totalScrapped,
    byIteration: Array.from(byIter.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([iteracion, data]) => ({
        iteracion,
        ...data,
        total: data.scrap + data.scrapEstrategico + data.raee + data.scSCrap,
      })),
  };
}

/**
 * Scrap analysis by reason (last diagnosis before scrap)
 */
export async function getScrapByReason(filters: RemanufacturaFilterSet) {
  const { conditions, params } = buildRawWhere(filters);
  const whereClause = conditions.join(" AND ");

  // Step 1: Get scrapped serials with scrap type
  const scrapped = await prisma.$queryRawUnsafe<{ numeroSerie: string; scrapType: string }[]>(`
    SELECT "numeroSerie", MIN("tipoTransaccion") as scrapType
    FROM "RemanufacturaTransaccion"
    WHERE ${whereClause}
      AND "tipoTransaccion" IN ('SCRAP', 'SCRAP ESTRATEGICO', 'RAEE', 'SC-SCRAP')
    GROUP BY "numeroSerie"
  `, ...params);

  // Step 2: Get last diagnosis for scrapped serials only (via Prisma ORM for efficiency)
  const scrappedSerials = scrapped.map((r) => r.numeroSerie);
  const diagMap = new Map<string, { resultadoDiagnostico: string; falla: string | null }>();

  // Process in batches of 500 to avoid SQLite param limits
  for (let i = 0; i < scrappedSerials.length; i += 500) {
    const batch = scrappedSerials.slice(i, i + 500);
    const diags = await prisma.remanufacturaTransaccion.findMany({
      where: {
        numeroSerie: { in: batch },
        resultadoDiagnostico: { not: null },
        OR: [
          { fechaTransaccion: { lt: SOURCE_CUTOFF }, source: "OSCM" },
          { fechaTransaccion: { gte: SOURCE_CUTOFF }, source: "WMS" },
        ],
      },
      select: { numeroSerie: true, resultadoDiagnostico: true, falla: true, fechaTransaccion: true },
      orderBy: { fechaTransaccion: "desc" },
    });
    // Keep only latest per serial
    for (const d of diags) {
      if (!diagMap.has(d.numeroSerie!)) {
        diagMap.set(d.numeroSerie!, { resultadoDiagnostico: d.resultadoDiagnostico!, falla: d.falla });
      }
    }
  }

  // Step 3: Tally
  const reasons = new Map<string, { scrapType: string; diagnostico: string; falla: string; fallaCode: string; cantidad: number }>();
  for (const s of scrapped) {
    const d = diagMap.get(s.numeroSerie);
    const diag = d?.resultadoDiagnostico || "SIN_DIAGNOSTICO";
    const fallaCode = diag === "SIN_FALLA" ? "—" : (d?.falla || "—");
    const falla = fallaCode === "—" ? "—" : (FAULT_CODES[fallaCode] || fallaCode);
    const key = `${s.scrapType}|${diag}|${fallaCode}`;
    const existing = reasons.get(key);
    if (existing) {
      existing.cantidad++;
    } else {
      reasons.set(key, { scrapType: s.scrapType, diagnostico: diag, falla, fallaCode, cantidad: 1 });
    }
  }

  return Array.from(reasons.values()).sort((a, b) => b.cantidad - a.cantidad);
}

/**
 * Import history
 */
export async function getImportHistory() {
  return prisma.remanufacturaImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
