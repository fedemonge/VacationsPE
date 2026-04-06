import { isWithinPeru } from './geo';

// ── Source record types (matching DB schema) ────────────────────────

export interface ScoreAgendaRecord {
  id: string;
  sot: string | null;
  codCliente: string | null;
  cliente: string | null;
  direccion: string | null;
  distrito: string | null;
  departamento: string | null;
  telefonoContactado: string | null;
  tipificacion: string | null;
  tipificacionHist: string | null;
  fechaGestion: Date | string | null;
  fechaAgenda: Date | string | null;
  rangoHorario: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface ClientDataRecord {
  id: string;
  customerId: string | null;
  customerName: string | null;
  address: string | null;
  district: string | null;
  department: string | null;
  phone1: string | null;
  phone2: string | null;
  latitude: number | null;
  longitude: number | null;
  coordsInPeru: boolean;
  hasValidCoords: boolean;
}

export interface RecuperoTask {
  id: string;
  contrato: string | null;
  agenteCampo: string;
  nombreUsuario: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  latitud: number | null;
  longitud: number | null;
  tipoCierre: string | null;
  tipoBase: string | null;
  estado: string | null;
  fechaCierre: Date | string | null;
  cedulaUsuario: string | null;
}

// ── Output types ────────────────────────────────────────────────────

export interface RouteVisit {
  id: string;
  lat: number;
  lon: number;
  esAgendada: boolean;
  periodo: "AM" | "PM";
  sourceType: "SCORE_AGENDA" | "CLIENT_DATA" | "RECUPERO_TASK";
  sourceId: string;
  sot: string | null;
  codCliente: string | null;
  cliente: string | null;
  direccion: string | null;
  distrito: string | null;
  departamento: string | null;
  telefono: string | null;
  fechaGestion: Date | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Parse rangoHorario to determine AM or PM period.
 * Common formats: "08:00 - 12:00", "AM", "PM", "13:00 - 17:00", "MANANA", "TARDE"
 */
function parsePeriod(rangoHorario: string | null): "AM" | "PM" {
  if (!rangoHorario) return "AM";
  const upper = rangoHorario.toUpperCase().trim();

  if (upper === "PM" || upper === "TARDE") return "PM";
  if (upper === "AM" || upper === "MANANA" || upper === "MAÑANA") return "AM";

  // Try to parse a time like "13:00 - 17:00" or "08:00-12:00"
  const match = upper.match(/(\d{1,2}):?(\d{2})?/);
  if (match) {
    const hour = parseInt(match[1], 10);
    if (hour >= 12) return "PM";
  }

  return "AM";
}

// Only these tipoCierre values are routable (from FSM table):
// Green (GESTIONABLE) + Sin Gestion — can be re-visited
const ROUTABLE_TIPOCIERRE_PATTERNS = [
  // Green / GESTIONABLE — field visit needed
  "cliente no encontrado",
  "desea la visita otro dia",
  "desea otro dia",
  "reconfirmado agente campo",
  "cliente de viaje",
  // SIN GESTION — not yet managed in the field
  "pend. visita",
  "pend visita",
  "asignado",
];

function isRoutableTipoCierre(tipoCierre: string | null | undefined): boolean {
  if (!tipoCierre) return false;
  const lower = tipoCierre.toLowerCase().trim();
  return ROUTABLE_TIPOCIERRE_PATTERNS.some((pattern) => lower.includes(pattern));
}

const EXCLUDE_TIPIFICACION_PATTERNS = ["fraude", "cliente ya entrego"];

function shouldExcludeByTipificacion(
  tipificacion: string | null | undefined,
  tipificacionHist: string | null | undefined
): boolean {
  const fields = [tipificacion, tipificacionHist].filter(Boolean) as string[];
  for (const field of fields) {
    const lower = field.toLowerCase();
    for (const pattern of EXCLUDE_TIPIFICACION_PATTERNS) {
      if (lower.includes(pattern)) return true;
    }
  }
  return false;
}

function hasValidCoords(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return (
    lat != null &&
    lon != null &&
    isFinite(lat) &&
    isFinite(lon) &&
    isWithinPeru(lat, lon)
  );
}

// ── Main function ───────────────────────────────────────────────────

export function determineGestionables(
  agendas: ScoreAgendaRecord[],
  clientRecords: ClientDataRecord[],
  recuperoTasks: RecuperoTask[],
  targetDate: Date
): { gestionables: RouteVisit[]; excluded: { id: string; reason: string }[] } {
  const gestionables: RouteVisit[] = [];
  const excluded: { id: string; reason: string }[] = [];
  const seenCodCliente = new Map<string, { visit: RouteVisit; fechaGestion: Date | null }>();

  // Build a lookup of recupero tasks by codCliente (cedulaUsuario acts as codCliente link)
  const recuperoByCodCliente = new Map<string, RecuperoTask[]>();
  for (const task of recuperoTasks) {
    const key = task.cedulaUsuario?.trim();
    if (key) {
      const arr = recuperoByCodCliente.get(key) || [];
      arr.push(task);
      recuperoByCodCliente.set(key, arr);
    }
  }

  // ── Step 1: Process Score Agenda records ──────────────────────────
  // Filter to those with fechaAgenda matching targetDate
  for (const agenda of agendas) {
    const fechaAgenda = toDate(agenda.fechaAgenda);

    // Only include agendas scheduled for the target date
    if (!fechaAgenda || !isSameDay(fechaAgenda, targetDate)) continue;

    // Exclude by tipificacion
    if (shouldExcludeByTipificacion(agenda.tipificacion, agenda.tipificacionHist)) {
      excluded.push({ id: agenda.id, reason: `Excluded tipificacion: ${agenda.tipificacion || agenda.tipificacionHist}` });
      continue;
    }

    // Exclude without valid coordinates in Peru
    if (!hasValidCoords(agenda.latitud, agenda.longitud)) {
      excluded.push({ id: agenda.id, reason: "Missing or invalid coordinates (outside Peru or null)" });
      continue;
    }

    const fechaGestion = toDate(agenda.fechaGestion);
    const codCliente = agenda.codCliente?.trim() || null;

    const visit: RouteVisit = {
      id: `agenda-${agenda.id}`,
      lat: agenda.latitud!,
      lon: agenda.longitud!,
      esAgendada: true,
      periodo: parsePeriod(agenda.rangoHorario),
      sourceType: "SCORE_AGENDA",
      sourceId: agenda.id,
      sot: agenda.sot,
      codCliente,
      cliente: agenda.cliente,
      direccion: agenda.direccion,
      distrito: agenda.distrito,
      departamento: agenda.departamento,
      telefono: agenda.telefonoContactado,
      fechaGestion,
    };

    // Deduplicate by codCliente: keep most recent by fechaGestion
    if (codCliente) {
      const existing = seenCodCliente.get(codCliente);
      if (existing) {
        const existingTime = existing.fechaGestion?.getTime() ?? 0;
        const newTime = fechaGestion?.getTime() ?? 0;
        if (newTime > existingTime) {
          // Replace: exclude the older one
          excluded.push({ id: existing.visit.id, reason: `Duplicate codCliente ${codCliente}: replaced by more recent record` });
          seenCodCliente.set(codCliente, { visit, fechaGestion });
        } else {
          excluded.push({ id: visit.id, reason: `Duplicate codCliente ${codCliente}: older record` });
          continue;
        }
      } else {
        seenCodCliente.set(codCliente, { visit, fechaGestion });
      }
    } else {
      // No codCliente -- add directly (can't deduplicate)
      gestionables.push(visit);
    }
  }

  // ── Step 2: Process Client Data records ───────────────────────────
  for (const client of clientRecords) {
    const codCliente = client.customerId?.trim() || null;

    // Skip if no valid coords
    if (!hasValidCoords(client.latitude, client.longitude)) {
      excluded.push({ id: client.id, reason: "Missing or invalid coordinates (outside Peru or null)" });
      continue;
    }

    // Cross-reference with recupero tasks
    if (codCliente) {
      const matchingTasks = recuperoByCodCliente.get(codCliente);

      if (matchingTasks && matchingTasks.length > 0) {
        // Check if any matching task has been successfully recovered
        const alreadyRecovered = matchingTasks.some(
          (t) => t.tipoCierre?.toUpperCase().trim() === "RECUPERADO WODEN"
        );
        if (alreadyRecovered) {
          excluded.push({ id: client.id, reason: `Recuperado (RECUPERADO WODEN) - codCliente ${codCliente}` });
          continue;
        }

        // Get latest task by fechaCierre to check if it's routable
        const sorted = matchingTasks
          .filter((t) => t.fechaCierre)
          .sort((a, b) => new Date(b.fechaCierre!).getTime() - new Date(a.fechaCierre!).getTime());
        const latest = sorted[0] || matchingTasks[0];

        // Only route if latest tipoCierre is GESTIONABLE or SIN GESTION
        if (!isRoutableTipoCierre(latest.tipoCierre)) {
          excluded.push({
            id: client.id,
            reason: `Irrecuperable: ${latest.tipoCierre} - codCliente ${codCliente}`,
          });
          continue;
        }
        // Latest status is routable (GESTIONABLE or SIN GESTION) — include as revisit
      }
      // No matching tasks -- never visited, gestionable
    }

    const visit: RouteVisit = {
      id: `client-${client.id}`,
      lat: client.latitude!,
      lon: client.longitude!,
      esAgendada: false,
      periodo: "AM", // Default: non-agendadas can go in either period
      sourceType: "CLIENT_DATA",
      sourceId: client.id,
      sot: null,
      codCliente,
      cliente: client.customerName,
      direccion: client.address,
      distrito: client.district,
      departamento: client.department,
      telefono: client.phone1 || client.phone2,
      fechaGestion: null,
    };

    // Deduplicate by codCliente
    if (codCliente) {
      const existing = seenCodCliente.get(codCliente);
      if (existing) {
        // Agenda records take priority over client data records
        if (existing.visit.sourceType === "SCORE_AGENDA") {
          excluded.push({ id: visit.id, reason: `Duplicate codCliente ${codCliente}: agenda record takes priority` });
          continue;
        }
        // Both are client data -- keep the one already there (first encountered)
        excluded.push({ id: visit.id, reason: `Duplicate codCliente ${codCliente}: already present` });
        continue;
      }
      seenCodCliente.set(codCliente, { visit, fechaGestion: null });
    } else {
      gestionables.push(visit);
    }
  }

  // ── Collect deduplicated entries from seenCodCliente ──────────────
  for (const { visit } of Array.from(seenCodCliente.values())) {
    gestionables.push(visit);
  }

  return { gestionables, excluded };
}
