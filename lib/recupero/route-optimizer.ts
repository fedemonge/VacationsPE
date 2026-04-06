import { haversineMeters } from './geo';
import { RouteVisit } from './gestionable';

// ── Interfaces ──────────────────────────────────────────────────────

export interface RouteConfig {
  velocidadKmh: number;
  duracionVisitaMin: number;
  distanciaMaximaKm: number;
  periodoAM: { inicio: string; fin: string };
  periodoPM: { inicio: string; fin: string };
  puntoInicio: { lat: number; lon: number };
}

export interface RouteStop {
  visit: RouteVisit;
  secuencia: number;
  periodo: "AM" | "PM";
  distanciaDesdeAnteriorKm: number;
  tiempoViajeMin: number;
  duracionVisitaMin: number;
  horaEstimadaLlegada: string;
  horaEstimadaSalida: string;
}

export interface RouteConflict {
  visit: RouteVisit;
  periodo: "AM" | "PM";
  reason: string;
}

export interface OptimizedRoute {
  paradas: RouteStop[];
  conflictos: RouteConflict[];
  totalDistanciaKm: number;
  totalVisitas: number;
  totalTiempoMin: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000;
}

export function travelTimeMinutes(distKm: number, speedKmh: number): number {
  if (speedKmh <= 0) return Infinity;
  return (distKm / speedKmh) * 60;
}

export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || "0", 10);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  velocidadKmh: 25,
  duracionVisitaMin: 10,
  distanciaMaximaKm: 10,
  periodoAM: { inicio: "08:00", fin: "12:00" },
  periodoPM: { inicio: "13:00", fin: "17:00" },
  puntoInicio: { lat: -12.0464, lon: -77.0428 },
};

// ── Core: 2-pass optimization ───────────────────────────────────────

export function optimizeRoute(
  visits: RouteVisit[],
  config: RouteConfig
): OptimizedRoute {
  if (visits.length === 0) {
    return { paradas: [], conflictos: [], totalDistanciaKm: 0, totalVisitas: 0, totalTiempoMin: 0 };
  }

  const { velocidadKmh, duracionVisitaMin, distanciaMaximaKm } = config;
  const amStart = timeToMinutes(config.periodoAM.inicio);
  const amEnd = timeToMinutes(config.periodoAM.fin);
  const pmStart = timeToMinutes(config.periodoPM.inicio);
  const pmEnd = timeToMinutes(config.periodoPM.fin);

  // Separate
  const agendadasAM: RouteVisit[] = [];
  const agendadasPM: RouteVisit[] = [];
  const pool: RouteVisit[] = []; // no-agendadas

  for (const v of visits) {
    if (v.esAgendada) {
      if (v.periodo === "PM") agendadasPM.push(v);
      else agendadasAM.push(v);
    } else {
      pool.push(v);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PASS 1: Route ALL agendadas by nearest-neighbor, report conflicts
  // ════════════════════════════════════════════════════════════════════

  interface RawStop {
    visit: RouteVisit;
    periodo: "AM" | "PM";
    lat: number;
    lon: number;
  }

  const conflictos: RouteConflict[] = [];
  const rawRoute: RawStop[] = [];

  function routeAgendadas(
    remaining: RouteVisit[],
    periodo: "AM" | "PM",
    periodEnd: number,
    startLat: number,
    startLon: number,
    startTime: number
  ): { endLat: number; endLon: number; endTime: number } {
    let curLat = startLat;
    let curLon = startLon;
    let curTime = startTime;
    const queue = [...remaining];

    while (queue.length > 0) {
      // Find nearest from current position
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < queue.length; i++) {
        const d = distanceKm(curLat, curLon, queue[i].lat, queue[i].lon);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }

      const next = queue.splice(nearestIdx, 1)[0];
      const travel = travelTimeMinutes(nearestDist, velocidadKmh);
      const arrival = curTime + travel;
      const departure = arrival + duracionVisitaMin;

      // Report conflict if exceeds period, but still include it
      if (departure > periodEnd) {
        conflictos.push({
          visit: next,
          periodo,
          reason: `No alcanza en periodo ${periodo} (llegada ${minutesToTime(arrival)}, fin periodo ${minutesToTime(periodEnd)})`,
        });
        // Don't add to route — report all remaining too
        for (const v of queue) {
          const d = distanceKm(curLat, curLon, v.lat, v.lon);
          conflictos.push({
            visit: v,
            periodo,
            reason: `No alcanza en periodo ${periodo} - dist. ${d.toFixed(1)} km desde ultima posicion`,
          });
        }
        break;
      }

      rawRoute.push({ visit: next, periodo, lat: next.lat, lon: next.lon });
      curLat = next.lat;
      curLon = next.lon;
      curTime = departure;
    }

    return { endLat: curLat, endLon: curLon, endTime: curTime };
  }

  // AM agendadas
  const amResult = routeAgendadas(agendadasAM, "AM", amEnd,
    config.puntoInicio.lat, config.puntoInicio.lon, amStart);

  // PM agendadas (start from where AM ended)
  routeAgendadas(agendadasPM, "PM", pmEnd,
    amResult.endLat, amResult.endLon, pmStart);

  // ════════════════════════════════════════════════════════════════════
  // PASS 2: Insert no-agendadas in gaps and remaining time
  // ════════════════════════════════════════════════════════════════════

  // Rebuild the full route with timing, inserting no-agendadas where they fit
  const paradas: RouteStop[] = [];
  let seq = 0;
  let totalDist = 0;
  let totalTime = 0;

  let curLat = config.puntoInicio.lat;
  let curLon = config.puntoInicio.lon;
  let curTime = amStart;
  let currentPeriodo: "AM" | "PM" = "AM";

  function addParada(visit: RouteVisit, periodo: "AM" | "PM"): boolean {
    const periodEnd = periodo === "AM" ? amEnd : pmEnd;
    const dist = distanceKm(curLat, curLon, visit.lat, visit.lon);
    const travel = travelTimeMinutes(dist, velocidadKmh);
    const arrival = curTime + travel;
    const departure = arrival + duracionVisitaMin;

    // Never exceed period end
    if (departure > periodEnd) return false;

    seq++;
    paradas.push({
      visit,
      secuencia: seq,
      periodo,
      distanciaDesdeAnteriorKm: Math.round(dist * 100) / 100,
      tiempoViajeMin: Math.round(travel * 10) / 10,
      duracionVisitaMin,
      horaEstimadaLlegada: minutesToTime(arrival),
      horaEstimadaSalida: minutesToTime(departure),
    });

    totalDist += dist;
    totalTime += travel + duracionVisitaMin;
    curLat = visit.lat;
    curLon = visit.lon;
    curTime = departure;
    return true;
  }

  function findBestPoolInsert(
    fromLat: number,
    fromLon: number,
    nextLat: number | null,
    nextLon: number | null,
    timeAvailable: number
  ): RouteVisit | null {
    let best: RouteVisit | null = null;
    let bestDist = Infinity;

    for (const c of pool) {
      const distToC = distanceKm(fromLat, fromLon, c.lat, c.lon);
      if (distToC > distanciaMaximaKm) continue;

      const travelToC = travelTimeMinutes(distToC, velocidadKmh);

      if (nextLat != null && nextLon != null) {
        // Check "en ruta": detour <= 1.5x
        const distCToNext = distanceKm(c.lat, c.lon, nextLat, nextLon);
        const directDist = distanceKm(fromLat, fromLon, nextLat, nextLon);
        if (directDist > 0 && distToC + distCToNext > directDist * 1.5) continue;

        // Time check: travel to candidate + visit + travel to next must fit
        const travelCToNext = travelTimeMinutes(distCToNext, velocidadKmh);
        if (travelToC + duracionVisitaMin + travelCToNext > timeAvailable) continue;
      } else {
        // No next stop — just check if visit fits in remaining time
        if (travelToC + duracionVisitaMin > timeAvailable) continue;
      }

      if (distToC < bestDist) {
        bestDist = distToC;
        best = c;
      }
    }
    return best;
  }

  function removeFromPool(v: RouteVisit): void {
    const idx = pool.indexOf(v);
    if (idx !== -1) pool.splice(idx, 1);
  }

  // Split rawRoute into AM and PM agendadas
  const amStops = rawRoute.filter(s => s.periodo === "AM");
  const pmStops = rawRoute.filter(s => s.periodo === "PM");

  // Helper: fill time with pool (no-agendadas) via nearest-neighbor
  function fillWithPool(periodo: "AM" | "PM", periodEnd: number): void {
    let found = true;
    while (found && pool.length > 0 && curTime < periodEnd) {
      found = false;
      const ins = findBestPoolInsert(curLat, curLon, null, null, periodEnd - curTime);
      if (ins) {
        if (addParada(ins, periodo)) {
          removeFromPool(ins);
          found = true;
        } else {
          break; // Can't fit — stop filling
        }
      }
    }
  }

  // Helper: insert pool between current position and next agendada
  function insertBeforeAgendada(nextStop: RawStop, periodEnd: number): void {
    let inserted = true;
    while (inserted && pool.length > 0) {
      inserted = false;
      const travelToNext = travelTimeMinutes(
        distanceKm(curLat, curLon, nextStop.lat, nextStop.lon), velocidadKmh
      );
      const timeForAgendada = travelToNext + duracionVisitaMin;
      const slack = periodEnd - curTime - timeForAgendada;
      if (slack < duracionVisitaMin) break;

      const ins = findBestPoolInsert(curLat, curLon, nextStop.lat, nextStop.lon, slack);
      if (ins) {
        if (addParada(ins, nextStop.periodo)) {
          removeFromPool(ins);
          inserted = true;
        } else {
          break;
        }
      }
    }
  }

  // ── AM Period ──────────────────────────────────────────────────
  for (const stop of amStops) {
    insertBeforeAgendada(stop, amEnd);
    if (!addParada(stop.visit, "AM")) {
      // Agendada doesn't fit — should not happen (Pass 1 already filtered)
      // but guard against it
      break;
    }
  }
  fillWithPool("AM", amEnd);

  // ── PM Period ──────────────────────────────────────────────────
  curTime = pmStart;
  for (const stop of pmStops) {
    insertBeforeAgendada(stop, pmEnd);
    if (!addParada(stop.visit, "PM")) {
      break;
    }
  }
  fillWithPool("PM", pmEnd);

  return {
    paradas,
    conflictos,
    totalDistanciaKm: Math.round(totalDist * 100) / 100,
    totalVisitas: paradas.length,
    totalTiempoMin: Math.round(totalTime * 10) / 10,
  };
}
