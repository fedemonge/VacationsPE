/**
 * Parser for Score Agenda Excel files from contact center.
 * Reads 38-column Excel files and returns parsed agenda records with
 * coordinates, dates, and time ranges normalized.
 */

import * as XLSX from "xlsx";
import { extractCoordsFromAddress, isWithinPeru } from "./geo";

// ---- Types ----

export interface ParsedScoreAgendaRecord {
  sot: string | null;
  codCliente: string | null;
  dni: string | null;
  cliente: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  tipoBaja: string | null;
  tecnologia: string | null;
  tipoAdquisicion: string | null;
  tipoProducto: string | null;
  cantidadEquipos: number;
  tipoBase: string | null;
  mesBase: string | null;
  proyecto: string | null;
  telefonoContactado: string | null;
  idCall: string | null;
  skill: string | null;
  idAgente: string | null;
  agenteNombre: string | null;
  resultadoMarcacion: string | null;
  novedadGeneral: string | null;
  tipificacion: string | null;
  tipificacionHist: string | null;
  fechaGestion: Date | null;
  comentarios: string | null;
  direccionActualizada: string | null;
  referencia: string | null;
  distritoAgenda: string | null;
  provinciaAgenda: string | null;
  departamentoAgenda: string | null;
  fechaAgenda: Date | null;
  horarioAgenda: string | null;
  telefonoReferencia: string | null;
  latitud: number | null;
  longitud: number | null;
  rangoHorario: string | null;
  tipoAgenda: string | null;
  rawData: Record<string, unknown>;
}

// ---- Column index mapping (0-based) ----
// Columns 0-27: base fields, 28-37: agenda-specific fields
// Some column names repeat (DIRECCIÓN, DISTRITO, PROVINCIA, DEPARTAMENTO)
// so we map by position index, not by name.

const COL = {
  SOT: 0,
  COD_CLIENTE: 1,
  DNI: 2,
  CLIENTE: 3,
  DIRECCION: 4,
  DISTRITO: 5,
  PROVINCIA: 6,
  DEPARTAMENTO: 7,
  TIPO_BAJA: 8,
  TECNOLOGIA: 9,
  TIPO_ADQUISICION: 10,
  TIPO_PRODUCTO: 11,
  CANTIDAD_EQUIPOS: 12,
  TIPO_BASE: 13,
  MES_BASE: 14,
  PROYECTO: 15,
  TELEFONO_CONTACTADO: 16,
  ID_CALL: 17,
  SKILL: 18,
  ID_AGENTE: 19,
  NOMBRE_AGENTE: 20,
  RESULTADO_MARCACION: 21,
  NOVEDAD_GENERAL: 22,
  TIPIFICACION: 23,
  TIPIFICACION_HIST: 24,
  FECHA_GESTION: 25,
  COMENTARIOS: 26,
  // Agenda-specific fields (second occurrence of repeated names)
  DIRECCION_AGENDA: 27,
  REFERENCIA: 28,
  DISTRITO_AGENDA: 29,
  PROVINCIA_AGENDA: 30,
  DEPARTAMENTO_AGENDA: 31,
  FECHA_AGENDA: 32,
  HORARIO_AGENDA: 33,
  TELF_REFERENCIA: 34,
  COORDENADAS: 35,
  RANGO_HORARIO: 36,
  TIPO_AGENDA: 37,
} as const;

// ---- Helper functions ----

/** Safely convert a cell value to a trimmed string, or null */
function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === "" || s === "null" || s === "undefined" || s === "N/A" ? null : s;
}

/** Safely parse a cell value as integer, with a default */
function num(val: unknown, defaultVal: number): number {
  if (val == null) return defaultVal;
  const s = String(val).trim();
  if (s === "" || s === "null" || s === "N/A") return defaultVal;
  const n = parseInt(s, 10);
  return isFinite(n) && n > 0 ? n : defaultVal;
}

/**
 * Parse an Excel serial date number into a JavaScript Date.
 * Excel serial: days since 1900-01-00 (with the Lotus 1-2-3 leap year bug).
 * Formula: new Date((serial - 25569) * 86400000)
 */
function parseExcelDate(val: unknown): Date | null {
  if (val == null) return null;

  // Already a Date object (XLSX may return this with cellDates option)
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const s = String(val).trim();
  if (s === "" || s === "null" || s === "N/A") return null;

  // Try as Excel serial number
  const serial = parseFloat(s);
  if (isFinite(serial) && serial > 40000 && serial < 60000) {
    // Valid range: ~2009 to ~2063
    const ms = (serial - 25569) * 86400000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try as ISO date string
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;

  // Try DD/MM/YYYY format
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/);
  if (m) {
    return new Date(
      parseInt(m[3]),
      parseInt(m[2]) - 1,
      parseInt(m[1]),
      parseInt(m[4] || "0"),
      parseInt(m[5] || "0"),
      parseInt(m[6] || "0")
    );
  }

  return null;
}

/**
 * Parse COORDENADAS text field into lat/lon.
 * Format: "-11.918685293704927, -77.05169064140122"
 */
function parseCoordinates(val: unknown): { lat: number; lon: number } | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;

  // Split on comma (with optional spaces)
  const parts = s.split(/\s*,\s*/);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());
    if (isFinite(lat) && isFinite(lon)) {
      return { lat, lon };
    }
  }

  // Fallback: try extractCoordsFromAddress (handles Google Maps URLs, etc.)
  return extractCoordsFromAddress(s);
}

/**
 * Parse RANGO HORARIO to determine AM/PM based on start time.
 * Examples:
 *   "09:00 AM  01:00 PM" → "AM" (start is AM)
 *   "02:00 PM  06:00PM"  → "PM" (start is PM)
 */
function parseRangoHorario(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim().toUpperCase();
  if (!s) return null;

  // Look for AM/PM in the start time (first occurrence)
  const match = s.match(/(\d{1,2}:\d{2})\s*(AM|PM)/);
  if (match) {
    return match[2]; // AM or PM from the start time
  }

  // If no AM/PM found, try to infer from hour
  const hourMatch = s.match(/^(\d{1,2}):/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour >= 0 && hour < 12) return "AM";
    if (hour >= 12) return "PM";
  }

  return s; // Return raw value if we can't parse
}

// ---- Main parser ----

export function parseScoreAgendas(
  buffer: Buffer,
  fileName: string
): {
  records: ParsedScoreAgendaRecord[];
  errors: string[];
  totalRows: number;
} {
  const errors: string[] = [];

  // Read workbook
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    return {
      records: [],
      errors: [`Failed to read Excel file "${fileName}": ${e instanceof Error ? e.message : String(e)}`],
      totalRows: 0,
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { records: [], errors: ["No sheets found in workbook"], totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetName];

  // Read as array-of-arrays to handle duplicate column names by position
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, // array of arrays (positional)
    defval: null,
    raw: true, // keep numbers as numbers (for Excel serial dates)
  });

  if (rawRows.length < 2) {
    return { records: [], errors: ["File has no data rows"], totalRows: 0 };
  }

  // First row is headers
  const headers = rawRows[0].map((h) => (h != null ? String(h).trim() : ""));
  console.log("[SCORE-AGENDA-PARSER] Headers:", headers);
  console.log("[SCORE-AGENDA-PARSER] Total columns:", headers.length);

  const dataRows = rawRows.slice(1);
  const totalRows = dataRows.length;
  const records: ParsedScoreAgendaRecord[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0) continue;

    // Skip completely empty rows
    const hasData = row.some((cell) => cell != null && String(cell).trim() !== "");
    if (!hasData) continue;

    try {
      const cell = (idx: number): unknown => (idx < row.length ? row[idx] : null);

      // Parse coordinates
      let latitud: number | null = null;
      let longitud: number | null = null;

      const coords = parseCoordinates(cell(COL.COORDENADAS));
      if (coords) {
        latitud = coords.lat;
        longitud = coords.lon;
      }

      // Fallback: try extracting coords from the agenda address field
      if (latitud == null || longitud == null) {
        const addrStr = str(cell(COL.DIRECCION_AGENDA));
        if (addrStr) {
          const fallback = extractCoordsFromAddress(addrStr);
          if (fallback) {
            latitud = fallback.lat;
            longitud = fallback.lon;
          }
        }
      }

      // Validate coords are within Peru
      if (latitud != null && longitud != null && !isWithinPeru(latitud, longitud)) {
        errors.push(
          `Row ${i + 2}: Coordinates (${latitud}, ${longitud}) are outside Peru for SOT ${str(cell(COL.SOT)) || "unknown"}`
        );
      }

      // Parse dates
      const fechaGestion = parseExcelDate(cell(COL.FECHA_GESTION));
      const fechaAgenda = parseExcelDate(cell(COL.FECHA_AGENDA));

      // Parse rango horario
      const rangoHorario = parseRangoHorario(cell(COL.RANGO_HORARIO));

      // Build raw data object for debugging
      const rawData: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        const key = h || `col_${idx}`;
        // Handle duplicate keys by appending suffix
        if (rawData[key] !== undefined) {
          rawData[`${key}_2`] = cell(idx);
        } else {
          rawData[key] = cell(idx);
        }
      });

      const record: ParsedScoreAgendaRecord = {
        sot: str(cell(COL.SOT)),
        codCliente: str(cell(COL.COD_CLIENTE)),
        dni: str(cell(COL.DNI)),
        cliente: str(cell(COL.CLIENTE)),
        direccion: str(cell(COL.DIRECCION)),
        distrito: str(cell(COL.DISTRITO)),
        provincia: str(cell(COL.PROVINCIA)),
        departamento: str(cell(COL.DEPARTAMENTO)),
        tipoBaja: str(cell(COL.TIPO_BAJA)),
        tecnologia: str(cell(COL.TECNOLOGIA)),
        tipoAdquisicion: str(cell(COL.TIPO_ADQUISICION)),
        tipoProducto: str(cell(COL.TIPO_PRODUCTO)),
        cantidadEquipos: num(cell(COL.CANTIDAD_EQUIPOS), 1),
        tipoBase: str(cell(COL.TIPO_BASE)),
        mesBase: str(cell(COL.MES_BASE)),
        proyecto: str(cell(COL.PROYECTO)),
        telefonoContactado: str(cell(COL.TELEFONO_CONTACTADO)),
        idCall: str(cell(COL.ID_CALL)),
        skill: str(cell(COL.SKILL)),
        idAgente: str(cell(COL.ID_AGENTE)),
        agenteNombre: str(cell(COL.NOMBRE_AGENTE)),
        resultadoMarcacion: str(cell(COL.RESULTADO_MARCACION)),
        novedadGeneral: str(cell(COL.NOVEDAD_GENERAL)),
        tipificacion: str(cell(COL.TIPIFICACION)),
        tipificacionHist: str(cell(COL.TIPIFICACION_HIST)),
        fechaGestion,
        comentarios: str(cell(COL.COMENTARIOS)),
        direccionActualizada: str(cell(COL.DIRECCION_AGENDA)),
        referencia: str(cell(COL.REFERENCIA)),
        distritoAgenda: str(cell(COL.DISTRITO_AGENDA)),
        provinciaAgenda: str(cell(COL.PROVINCIA_AGENDA)),
        departamentoAgenda: str(cell(COL.DEPARTAMENTO_AGENDA)),
        fechaAgenda,
        horarioAgenda: str(cell(COL.HORARIO_AGENDA)),
        telefonoReferencia: str(cell(COL.TELF_REFERENCIA)),
        latitud,
        longitud,
        rangoHorario,
        tipoAgenda: str(cell(COL.TIPO_AGENDA)),
        rawData,
      };

      records.push(record);
    } catch (e) {
      errors.push(
        `Row ${i + 2}: Failed to parse - ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log(
    `[SCORE-AGENDA-PARSER] Parsed ${records.length}/${totalRows} rows from "${fileName}" (${errors.length} errors)`
  );

  return { records, errors, totalRows };
}
