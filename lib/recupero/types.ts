export interface RecuperoTaskRow {
  id?: string;
  contrato?: string;
  grupo?: string;
  documento_id?: string;
  agente_campo: string;
  cedula_usuario?: string;
  nombre_usuario?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  latitud?: number | null;
  longitud?: number | null;
  tarea?: string;
  fecha_cierre?: string;
  estado?: string;
  latitud_cierre?: number | null;
  longitud_cierre?: number | null;
  tipo_cierre?: string;
  tipo_base?: string;
  // Equipment fields
  serial?: string;
  serial_adicional?: string;
  tarjetas?: boolean;
  controles?: boolean;
  fuentes?: boolean;
  cable_poder?: boolean;
  cable_fibra?: boolean;
  cable_hdmi?: boolean;
  cables_rca?: boolean;
  cables_rj11?: boolean;
  cables_rj45?: boolean;
  gestion_exitosa?: boolean;
}

export type CoordStatus = "VALID" | "OUTSIDE_PERU" | "MISSING" | "EXTRACTED";

export type PinType = "scheduled" | "successful" | "unsuccessful" | "burned";

export interface RecuperoFilters {
  periodoYear?: number;
  periodoMonth?: number;
  tipoBase?: string;
  agenteCampo?: string;
  estado?: string;
  coordStatus?: string;
  esQuemada?: boolean;
  esAgendado?: boolean;
  grupo?: string;
  page?: number;
  limit?: number;
}

export interface RecuperoStats {
  total: number;
  exitosas: number;
  noExitosas: number;
  quemadas: number;
  sinCoords: number;
  fueraDePeru: number;
  agentes: number;
  totalEquipos: number;
  factorDeUso: number;
}

export interface ImportResult {
  importId: string;
  totalRows: number;
  imported: number;
  errors: number;
  burned: number;
  outsidePeru: number;
  missingCoords: number;
}

// The only successful outcome is "RECUPERADO WODEN" in tipo_cierre
export const SUCCESS_TIPO_CIERRE = "RECUPERADO WODEN";

// Legacy: kept for raw SQL in stats
export const SUCCESS_STATUSES = ["RECUPERADO WODEN"];

export function isSuccessful(tipoCierre: string | null | undefined): boolean {
  if (!tipoCierre) return false;
  return tipoCierre.toUpperCase().trim() === SUCCESS_TIPO_CIERRE;
}

export function isAgendado(tarea: string | null | undefined): boolean {
  if (!tarea) return true;
  return !tarea.trim().toUpperCase().startsWith("VISITA");
}
