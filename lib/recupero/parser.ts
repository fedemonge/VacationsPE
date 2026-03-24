import * as XLSX from "xlsx";
import { RecuperoTaskRow } from "./types";

/**
 * Parse an uploaded file (XLSX or TXT) into RecuperoTaskRow[]
 */
export function parseFile(
  buffer: Buffer,
  fileName: string
): RecuperoTaskRow[] {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") {
    return parseXlsx(buffer);
  } else if (ext === "txt" || ext === "csv") {
    return parseTxt(buffer);
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

function parseXlsx(buffer: Buffer): RecuperoTaskRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  if (raw.length === 0) return [];

  // Log headers for debugging
  const headers = Object.keys(raw[0]);
  console.log("[PARSER] Excel headers:", headers);

  const colMap = buildColumnMap(headers);
  return raw.map((row) => mapRow(row, colMap)).filter(Boolean) as RecuperoTaskRow[];
}

function parseTxt(buffer: Buffer): RecuperoTaskRow[] {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detect delimiter: tab, ¬ (NOT sign), tilde, pipe, semicolon, comma
  const headerLine = lines[0];
  let delimiter = "\t";
  if (!headerLine.includes("\t")) {
    if (headerLine.includes("\u00AC")) delimiter = "\u00AC";  // ¬ (NOT sign)
    else if (headerLine.includes("~")) delimiter = "~";
    else if (headerLine.includes("|")) delimiter = "|";
    else if (headerLine.includes(";")) delimiter = ";";
    else if (headerLine.includes(",")) delimiter = ",";
  }

  const headers = headerLine.split(delimiter).map((h) => h.trim());
  console.log("[PARSER] TXT headers:", headers);

  const colMap = buildColumnMap(headers);
  const rows: RecuperoTaskRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx]?.trim() ?? null;
    });
    try {
      const mapped = mapRow(obj, colMap);
      if (mapped) rows.push(mapped);
    } catch {
      // Skip malformed rows
    }
  }

  return rows;
}

// Column name patterns — each key maps to multiple possible header names
const COLUMN_PATTERNS: Record<string, string[]> = {
  id: ["id", "ID", "Id", "codigo", "code"],
  contrato: ["contrato", "Contrato", "CONTRATO", "contract", "nro_contrato"],
  grupo: ["grupo", "Grupo", "GRUPO", "group", "project", "proyecto"],
  documento_id: ["documento_id", "documento_identidad", "Documento_id", "DOCUMENTO_ID", "DOCUMENTO_IDENTIDAD", "documentoId", "documento", "doc_id"],
  agente_campo: ["agente_campo", "Agente_campo", "AGENTE_CAMPO", "agenteCampo", "agente", "Agente", "AGENTE", "tecnico", "motorizado", "field_agent"],
  cedula_usuario: ["cedula_usuario", "Cedula_usuario", "CEDULA_USUARIO", "cedulaUsuario", "cedula", "dni", "documento_usuario"],
  nombre_usuario: ["nombre_usuario", "Nombre_usuario", "NOMBRE_USUARIO", "nombreUsuario", "nombre", "cliente", "customer", "usuario"],
  direccion: ["direccion", "Direccion", "DIRECCION", "address", "domicilio", "dir", "ubicacion"],
  ciudad: ["ciudad", "Ciudad", "CIUDAD", "city", "localidad"],
  departamento: ["departamento", "Departamento", "DEPARTAMENTO", "depto", "dpto", "region"],
  latitud: ["latitud", "Latitud", "LATITUD", "lat", "latitude"],
  longitud: ["longitud", "Longitud", "LONGITUD", "lon", "longitude", "lng", "long"],
  tarea: ["tarea", "Tarea", "TAREA", "task", "tipo_tarea", "actividad"],
  fecha_cierre: ["fecha_cierre", "Fecha_cierre", "FECHA_CIERRE", "fechaCierre", "fecha_fin", "close_date", "fecha"],
  estado: ["estado", "estatus", "Estado", "Estatus", "ESTADO", "ESTATUS", "status", "resultado", "result"],
  latitud_cierre: ["latitud_cierre", "Latitud_cierre", "LATITUD_CIERRE", "latitudCierre", "lat_cierre"],
  longitud_cierre: ["longitud_cierre", "Longitud_cierre", "LONGITUD_CIERRE", "longitudCierre", "lon_cierre", "lng_cierre", "long_cierre"],
  tipo_cierre: ["tipo_cierre", "Tipo_cierre", "TIPO_CIERRE", "tipoCierre", "resultado_visita", "outcome"],
  tipo_base: ["tipo_base", "Tipo_base", "TIPO_BASE", "tipoBase", "base_type"],
  // Equipment columns
  serial: ["serial", "Serial", "SERIAL"],
  serial_adicional: ["serial_adicional", "Serial_adicional", "SERIAL_ADICIONAL", "serialAdicional"],
  tarjetas: ["tarjetas", "Tarjetas", "TARJETAS"],
  controles: ["controles", "Controles", "CONTROLES"],
  fuentes: ["fuentes", "Fuentes", "FUENTES"],
  cable_poder: ["cable_poder", "Cable_poder", "CABLE_PODER", "cablePoder"],
  cable_fibra: ["cable_fibra", "Cable_fibra", "CABLE_FIBRA", "cableFibra"],
  cable_hdmi: ["cable_hdmi", "Cable_hdmi", "CABLE_HDMI", "cableHdmi"],
  cables_rca: ["cables_rca", "Cables_rca", "CABLES_RCA", "cablesRca"],
  cables_rj11: ["cables_rj11", "Cables_rj11", "CABLES_RJ11", "cablesRj11"],
  cables_rj45: ["cables_rj45", "Cables_rj45", "CABLES_RJ45", "cablesRj45"],
  gestion_exitosa: ["gestion_exitosa", "Gestion_exitosa", "GESTION_EXITOSA", "gestionExitosa"],
};

/**
 * Find which actual header name matches each field.
 * Uses exact match first, then case-insensitive partial match.
 */
function buildColumnMap(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const headersLower = headers.map((h) => h.toLowerCase().trim());

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    let found: string | null = null;

    // Exact match first
    for (const pattern of patterns) {
      const idx = headers.indexOf(pattern);
      if (idx >= 0) {
        found = headers[idx];
        break;
      }
    }

    // Case-insensitive match
    if (!found) {
      for (const pattern of patterns) {
        const idx = headersLower.indexOf(pattern.toLowerCase());
        if (idx >= 0) {
          found = headers[idx];
          break;
        }
      }
    }

    // Partial match (header contains pattern)
    if (!found) {
      for (const pattern of patterns) {
        const patLower = pattern.toLowerCase();
        const idx = headersLower.findIndex((h) => h.includes(patLower) || patLower.includes(h));
        if (idx >= 0) {
          found = headers[idx];
          break;
        }
      }
    }

    map[field] = found;
  }

  console.log("[PARSER] Column mapping:", JSON.stringify(map, null, 0));
  return map;
}

/**
 * Map a raw row object to RecuperoTaskRow using a pre-built column mapping.
 */
function mapRow(raw: Record<string, unknown>, colMap: Record<string, string | null>): RecuperoTaskRow | null {

  const get = (field: string): string | undefined => {
    const col = colMap[field];
    if (!col) return undefined;
    const val = raw[col];
    if (val == null || String(val).trim() === "") return undefined;
    return String(val).trim();
  };

  const getNum = (field: string): number | null => {
    const v = get(field);
    if (!v || v === "NaN" || v === "nan" || v === "null" || v === "N/A") return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  };

  const getBool = (field: string): boolean => {
    const v = get(field);
    if (!v) return false;
    const upper = v.toUpperCase();
    return upper === "SI" || upper === "SÍ" || upper === "YES" || upper === "1" || upper === "TRUE";
  };

  const agente = get("agente_campo");
  if (!agente && !get("id") && !get("contrato")) {
    return null; // Skip empty rows
  }

  return {
    id: get("id"),
    contrato: get("contrato"),
    grupo: get("grupo"),
    documento_id: get("documento_id"),
    agente_campo: agente || "DESCONOCIDO",
    cedula_usuario: get("cedula_usuario"),
    nombre_usuario: get("nombre_usuario"),
    direccion: get("direccion"),
    ciudad: get("ciudad"),
    departamento: get("departamento"),
    latitud: getNum("latitud"),
    longitud: getNum("longitud"),
    tarea: get("tarea"),
    fecha_cierre: get("fecha_cierre"),
    estado: get("estado"),
    latitud_cierre: getNum("latitud_cierre"),
    longitud_cierre: getNum("longitud_cierre"),
    tipo_cierre: get("tipo_cierre"),
    tipo_base: get("tipo_base"),
    // Equipment fields
    serial: get("serial"),
    serial_adicional: get("serial_adicional"),
    tarjetas: getBool("tarjetas"),
    controles: getBool("controles"),
    fuentes: getBool("fuentes"),
    cable_poder: getBool("cable_poder"),
    cable_fibra: getBool("cable_fibra"),
    cable_hdmi: getBool("cable_hdmi"),
    cables_rca: getBool("cables_rca"),
    cables_rj11: getBool("cables_rj11"),
    cables_rj45: getBool("cables_rj45"),
    gestion_exitosa: getBool("gestion_exitosa"),
  };
}

/**
 * Parse a date string into a Date object.
 */
export function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  const d = new Date(dateStr);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;

  // Try DD/MM/YYYY HH:mm:ss
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/);
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
