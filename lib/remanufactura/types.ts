export type RemanufacturaSource = "OSCM" | "WMS";

export type Etapa = "INGRESO" | "DIAGNOSTICO" | "REPARACION" | "SALIDA";

export type ResultadoDiagnostico = "SIN_FALLA" | "CON_FALLA";

// Known fault codes (from DTV Circular Economy report)
export const FAULT_CODES: Record<string, string> = {
  OX: "Óxido",
  NE: "No Enciende",
  CS: "No Recibe Señal de Satélite",
  CT: "No Reconoce Tarjeta",
  HDMI: "Falla Salida HDMI",
  SW: "Problema de Software",
  CI: "Congelamiento de Imagen",
  BOT: "Botonera",
  VID: "Falla Salida de Video",
  LED: "LED",
  IR: "Infrarrojo",
  AUD: "Audio",
  AR: "Auto-Reset",
  SF: "Sin Falla",
  OTRO: "Otra",
};

// Equipment families
export const EQUIPMENT_FAMILIES = [
  "HD ONLY",
  "HD DVR",
  "SD",
  "MODEM",
  "OTRO",
] as const;

export interface RemanufacturaTransaccionRow {
  fechaTransaccion?: string | null;
  transaccionId?: string | null;
  tipoTransaccion?: string | null;
  numeroEnvio?: string | null;
  numeroSerie?: string | null;
  codigoCategoria?: string | null;
  familiaEquipo?: string | null;
  clienteNormalizado?: string | null;
  orgOrigen?: string | null;
  nombreOrgOrigen?: string | null;
  subinvOrigen?: string | null;
  locatorOrigen?: string | null;
  orgDestino?: string | null;
  nombreOrgDestino?: string | null;
  subinvDestino?: string | null;
  locatorDestino?: string | null;
  estado?: string | null;
  falla?: string | null;
  etapa?: string | null;
  resultadoDiagnostico?: string | null;
  elementosTransaccionados?: number;
  referenciaTransaccion?: string | null;
  usuario?: string | null;
  smartCardSerial?: string | null;
  macAddress?: string | null;
  ibsAccountNumber?: string | null;
  ridNumber?: string | null;
  rawData?: string;
}

export interface RemanufacturaFilters {
  source?: RemanufacturaSource;
  fechaDesde?: string;
  fechaHasta?: string;
  familiaEquipo?: string;
  falla?: string;
  etapa?: string;
  tipoTransaccion?: string;
  orgDestino?: string;
  numeroSerie?: string;
}

export interface RemanufacturaStats {
  totalTransacciones: number;
  totalEquiposUnicos: number;
  totalOSCM: number;
  totalWMS: number;
  porFamilia: { familia: string; cantidad: number }[];
  sinFalla: number;
  conFalla: number;
  porcentajeSinFalla: number;
}

export interface IterationAnalysis {
  iteracion: number;
  cantidad: number;
  porcentaje: number;
}

export interface FaultAnalysis {
  falla: string;
  fallaDescripcion: string;
  cantidad: number;
  porcentaje: number;
}

export interface FaultByIterationAnalysis {
  iteracion: number;
  fallas: FaultAnalysis[];
  totalConFalla: number;
  totalSinFalla: number;
}

export interface ImportResult {
  importId: string;
  source: RemanufacturaSource;
  totalRows: number;
  imported: number;
  errors: number;
}

// OSCM column patterns for header detection
export const OSCM_HEADER_PATTERNS = [
  "Fecha Transaccion",
  "Transaccion",
  "Tipo Transaccion",
  "Numero Serie",
  "Historico de Series",
];

// WMS column patterns for header detection
export const WMS_HEADER_PATTERNS = [
  "Codigo Barras",
  "Resultado Diagnostico",
  "Tipo Falla",
  "Numero Ingreso",
];

// Lab organizations (equipment sent here = lab entry)
export const LAB_ORGS = [
  "IQREC00_PE_LAB",
  "IQ ELECTRO",
  "N3",
  "PE_LAB",
  "_LAB",
];

export function isLabOrg(org: string | null | undefined): boolean {
  if (!org) return false;
  const upper = org.toUpperCase();
  return LAB_ORGS.some((lab) => upper.includes(lab.toUpperCase()));
}

/**
 * Normalize client name:
 * - IQ Electronics, Woden, DirecTV, DIRECTV, DTV → "DIRECTV"
 * - Everything else keeps its original name (uppercased)
 */
export function normalizeCliente(
  orgOrigen: string | null | undefined,
  sheetName?: string | null
): string | null {
  const raw = orgOrigen || sheetName;
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();

  if (
    upper.includes("IQ ELECTRO") ||
    upper.includes("WODEN") ||
    upper.includes("DIRECTV") ||
    upper.includes("DIRECT TV") ||
    upper === "DTV"
  ) {
    return "DIRECTV";
  }

  // Return cleaned name
  return upper;
}
