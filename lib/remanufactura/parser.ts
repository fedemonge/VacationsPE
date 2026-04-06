import * as XLSX from "xlsx";
import {
  RemanufacturaTransaccionRow,
  RemanufacturaSource,
  isLabOrg,
  normalizeCliente,
} from "./types";

// Known WMS data sheet names (client tabs)
const WMS_DATA_SHEETS = ["DTV", "CLARO", "WOW", "INTEGRATEL"];

// WMS header signature: if a sheet's first row contains these columns, it's WMS data
const WMS_REQUIRED_COLS = ["Serial", "FechaIngreso", "Familia"];

// OSCM header keywords for detecting header row
const OSCM_HEADER_KEYWORDS = [
  "transacci", "serie", "numero", "organizaci", "categor",
  "inventario", "destino", "origen", "estado", "elementos",
  "subinvent", "locator",
];

/**
 * Parse an uploaded Excel/CSV file into RemanufacturaTransaccionRow[]
 * Supports:
 *  - WMS multi-sheet files (CLARO, WOW, INTEGRATEL, DTV tabs)
 *  - OSCM Histórico de Series (single sheet with title rows)
 *  - CSV/TXT files
 */
export function parseRemanufacturaFile(
  buffer: Buffer,
  fileName: string,
  forcedSource?: RemanufacturaSource
): { rows: RemanufacturaTransaccionRow[]; detectedSource: RemanufacturaSource } {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "xlsx" || ext === "xls") {
    return parseExcel(buffer, forcedSource);
  } else if (ext === "txt" || ext === "csv") {
    return parseCsv(buffer, forcedSource);
  }
  throw new Error(`Tipo de archivo no soportado: .${ext}`);
}

// ──────────────── Excel parsing ────────────────

function parseExcel(
  buffer: Buffer,
  forcedSource?: RemanufacturaSource
): { rows: RemanufacturaTransaccionRow[]; detectedSource: RemanufacturaSource } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetNames = workbook.SheetNames;
  console.log("[REMANUFACTURA PARSER] Sheets:", sheetNames);

  // Detect if this is a WMS multi-client workbook
  const wmsSheets = sheetNames.filter((name) =>
    WMS_DATA_SHEETS.some((ds) => name.toUpperCase() === ds.toUpperCase())
  );

  // Also check if any sheet has WMS-style headers (Cliente, FechaIngreso, Serial, Familia)
  const sheetsWithWmsHeaders: string[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const firstRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1, defval: null, raw: false, range: 0,
    });
    if (firstRow.length > 0 && Array.isArray(firstRow[0])) {
      const headers = (firstRow[0] as unknown[]).map((h) => String(h || "").trim());
      const matchCount = WMS_REQUIRED_COLS.filter((req) =>
        headers.some((h) => h.toLowerCase().includes(req.toLowerCase()))
      ).length;
      if (matchCount >= 2) sheetsWithWmsHeaders.push(name);
    }
  }

  const isWms = forcedSource === "WMS" || (!forcedSource && (wmsSheets.length > 0 || sheetsWithWmsHeaders.length > 0));

  if (isWms) {
    // Parse all WMS data sheets
    const dataSheets = sheetsWithWmsHeaders.length > 0 ? sheetsWithWmsHeaders : wmsSheets;
    console.log("[REMANUFACTURA PARSER] WMS mode — parsing sheets:", dataSheets);
    const allRows: RemanufacturaTransaccionRow[] = [];

    for (const name of dataSheets) {
      const sheet = workbook.Sheets[name];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null, raw: false,
      });
      if (rawRows.length === 0) continue;

      const headers = Object.keys(rawRows[0]);
      console.log(`[REMANUFACTURA PARSER] Sheet "${name}": ${rawRows.length} rows, headers: ${headers.slice(0, 10).join(", ")}`);

      for (const row of rawRows) {
        const mapped = mapWmsRow(row, name, headers);
        if (mapped) allRows.push(mapped);
      }
    }

    console.log(`[REMANUFACTURA PARSER] WMS total parsed: ${allRows.length}`);
    return { rows: allRows, detectedSource: "WMS" };
  }

  // OSCM mode: find the right sheet and detect header row
  console.log("[REMANUFACTURA PARSER] OSCM mode");
  let sheetName = sheetNames[0];
  for (const name of sheetNames) {
    const lower = name.toLowerCase();
    if (lower.includes("histor") || lower.includes("serie") || lower.includes("oscm")) {
      sheetName = name;
      break;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const allArrayRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, defval: null, raw: false,
  });

  // Find header row by keyword matching
  let headerRowIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(allArrayRows.length, 20); i++) {
    const row = allArrayRows[i];
    if (!Array.isArray(row)) continue;
    const rowStr = row
      .filter(Boolean)
      .map((c) => String(c).toLowerCase().replace(/[\r\n]+/g, " "))
      .join(" ");
    const score = OSCM_HEADER_KEYWORDS.filter((kw) => rowStr.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = i;
    }
  }

  console.log(`[REMANUFACTURA PARSER] OSCM header row: ${headerRowIdx} (score: ${bestScore})`);

  const rawHeaders = (allArrayRows[headerRowIdx] as unknown[]) || [];
  const headers = rawHeaders.map((h) =>
    h ? String(h).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim() : ""
  );

  const rawRows: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < allArrayRows.length; i++) {
    const rowArr = allArrayRows[i] as unknown[];
    if (!rowArr || rowArr.every((c) => c === null || c === undefined || c === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = rowArr[idx] ?? null;
    });
    rawRows.push(obj);
  }

  console.log(`[REMANUFACTURA PARSER] OSCM headers: ${headers.filter(Boolean).slice(0, 12).join(", ")}`);
  console.log(`[REMANUFACTURA PARSER] OSCM data rows: ${rawRows.length}`);

  const colMap = buildOscmColumnMap(headers);
  const rows = rawRows
    .map((row) => mapOscmRow(row, colMap, headers))
    .filter(Boolean) as RemanufacturaTransaccionRow[];

  return { rows, detectedSource: "OSCM" };
}

// ──────────────── CSV parsing ────────────────

function parseCsv(
  buffer: Buffer,
  forcedSource?: RemanufacturaSource
): { rows: RemanufacturaTransaccionRow[]; detectedSource: RemanufacturaSource } {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], detectedSource: forcedSource || "WMS" };

  const headerLine = lines[0];
  let delimiter = "\t";
  if (!headerLine.includes("\t")) {
    if (headerLine.includes("|")) delimiter = "|";
    else if (headerLine.includes(";")) delimiter = ";";
    else if (headerLine.includes(",")) delimiter = ",";
  }

  const headers = headerLine.split(delimiter).map((h) => h.trim());
  const rawRows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx]?.trim() ?? null;
    });
    rawRows.push(obj);
  }

  // Detect WMS vs OSCM from headers
  const hasWmsCols = WMS_REQUIRED_COLS.filter((req) =>
    headers.some((h) => h.toLowerCase().includes(req.toLowerCase()))
  ).length >= 2;

  if (hasWmsCols || forcedSource === "WMS") {
    const rows = rawRows
      .map((row) => mapWmsRow(row, "CSV", headers))
      .filter(Boolean) as RemanufacturaTransaccionRow[];
    return { rows, detectedSource: "WMS" };
  }

  const colMap = buildOscmColumnMap(headers);
  const rows = rawRows
    .map((row) => mapOscmRow(row, colMap, headers))
    .filter(Boolean) as RemanufacturaTransaccionRow[];
  return { rows, detectedSource: "OSCM" };
}

// ──────────────── WMS row mapping ────────────────

/**
 * Map a WMS row. WMS sheets have columns:
 * Cliente, FechaIngreso, FechaDespacho, Serial, Mac, Modelo,
 * [Clasificacion], Familia, Nivel, Tipologia, Localizacion,
 * FechaDiagnostico, FallaDiag, EstadoFinal, FechaReparación,
 * FallaReparación, Reingresos, [Nivel Reparacion], [PeriodoDiagnostico], [PeriodoIngreso]
 */
function mapWmsRow(
  row: Record<string, unknown>,
  sheetName: string,
  headers: string[]
): RemanufacturaTransaccionRow | null {
  const serial = str(row, "Serial");
  if (!serial) return null;

  const cliente = str(row, "Cliente") || sheetName;
  const fechaIngreso = str(row, "FechaIngreso") || str(row, "Fecha Ingreso");
  const fechaDespacho = str(row, "FechaDespacho") || str(row, "Fecha Despacho");
  const mac = str(row, "Mac") || str(row, "MAC");
  const modelo = str(row, "Modelo");
  const clasificacion = str(row, "Clasificacion") || str(row, "Clasificación");
  const familia = str(row, "Familia");
  const nivel = str(row, "Nivel");
  const tipologia = str(row, "Tipologia") || str(row, "Tipología");
  const localizacion = str(row, "Localizacion") || str(row, "Localización");
  const fechaDiag = str(row, "FechaDiagnostico") || str(row, "Fecha Diagnostico") || str(row, "FechaDiagnóstico");
  const fallaDiagRaw = str(row, "FallaDiag") || str(row, "Falla Diag");
  const estadoFinal = str(row, "EstadoFinal") || str(row, "Estado Final");
  const fechaRep = str(row, "FechaReparación") || str(row, "FechaReparacion") || str(row, "Fecha Reparación");
  const fallaRepRaw = str(row, "FallaReparación") || str(row, "FallaReparacion") || str(row, "Falla Reparación");
  const reingresosStr = str(row, "Reingresos");
  const nivelRep = str(row, "Nivel Reparacion") || str(row, "Nivel Reparación");
  const periodoDiag = str(row, "PeriodoDiagnostico") || str(row, "Periodo Diagnostico");
  const periodoIngreso = str(row, "PeriodoIngreso") || str(row, "Periodo Ingreso");

  // Parse fault codes — format is "OX|OXIDO" or "SF|SIN FALLA" or just text
  const fallaDiag = parseFaultCode(fallaDiagRaw);
  const fallaRep = parseFaultCode(fallaRepRaw);

  // Determine resultado from fallaDiag
  let resultadoDiagnostico: string | null = null;
  if (fallaDiag) {
    resultadoDiagnostico = fallaDiag === "SF" ? "SIN_FALLA" : "CON_FALLA";
  }

  // Determine etapa: if has diagnóstico data → DIAGNOSTICO, if has reparación → REPARACION
  let etapa: string | null = null;
  if (fechaDiag || fallaDiag) etapa = "DIAGNOSTICO";
  if (fechaRep || fallaRep) etapa = "REPARACION";
  if (!etapa) etapa = "INGRESO";

  // The primary falla to store: use repair fault if available, otherwise diagnosis fault
  const falla = fallaRep || fallaDiag;

  const reingresos = reingresosStr ? parseInt(reingresosStr, 10) : 0;

  // Build rawData with all unmapped/extra fields
  const rawData: Record<string, unknown> = {
    cliente,
    fechaDespacho,
    modelo,
    clasificacion,
    nivel,
    tipologia,
    localizacion,
    estadoFinal,
    nivelRep,
    periodoDiag,
    periodoIngreso,
    reingresos,
    fallaDiagRaw: fallaDiagRaw,
    fallaRepRaw: fallaRepRaw,
  };

  return {
    fechaTransaccion: parseDate(fechaIngreso),
    transaccionId: null,
    tipoTransaccion: tipologia,
    numeroEnvio: fechaDespacho,
    numeroSerie: serial,
    codigoCategoria: clasificacion,
    familiaEquipo: familia || null,
    clienteNormalizado: normalizeCliente(cliente, sheetName),
    orgOrigen: cliente,
    nombreOrgOrigen: cliente,
    subinvOrigen: localizacion,
    locatorOrigen: null,
    orgDestino: nivel,
    nombreOrgDestino: null,
    subinvDestino: null,
    locatorDestino: null,
    estado: estadoFinal,
    falla: falla,
    etapa: etapa,
    resultadoDiagnostico,
    elementosTransaccionados: 1,
    referenciaTransaccion: periodoIngreso,
    usuario: null,
    smartCardSerial: null,
    macAddress: mac,
    ibsAccountNumber: null,
    ridNumber: null,
    rawData: JSON.stringify(rawData),
  };
}

/**
 * Parse fault code from WMS format: "OX|OXIDO", "SF|SIN FALLA", "NE|NO ENCIENDE", etc.
 * Returns the short code (OX, SF, NE, etc.) or null if empty/whitespace.
 */
function parseFaultCode(raw: string | null): string | null {
  if (!raw || !raw.trim() || raw.trim() === "0" || raw.trim().toLowerCase() === "nan") return null;
  const trimmed = raw.trim();
  // Format: "CODE|DESCRIPTION"
  if (trimmed.includes("|")) {
    return trimmed.split("|")[0].trim().toUpperCase();
  }
  // Plain text — try to map to known codes
  const upper = trimmed.toUpperCase();
  if (upper === "SIN FALLA" || upper === "SF") return "SF";
  if (upper.includes("OXIDO") || upper.includes("ÓXIDO")) return "OX";
  if (upper.includes("NO ENCIENDE")) return "NE";
  if (upper.includes("HDMI")) return "HDMI";
  if (upper.includes("NO RECIBE") || upper.includes("SATELITE") || upper.includes("SEÑAL")) return "CS";
  if (upper.includes("TARJETA") || upper.includes("NO RECONOCE")) return "CT";
  if (upper.includes("SOFTWARE")) return "SW";
  if (upper.includes("CONGELA")) return "CI";
  if (upper.includes("BOTONERA")) return "BOT";
  if (upper.includes("VIDEO")) return "VID";
  if (upper.includes("LED")) return "LED";
  if (upper.includes("INFRARROJO")) return "IR";
  if (upper.includes("AUDIO")) return "AUD";
  if (upper.includes("AUTO-RESET") || upper.includes("AUTORESET")) return "AR";
  return trimmed; // Return as-is if not recognized
}

// ──────────────── OSCM row mapping ────────────────

const OSCM_COLUMNS: Record<string, string[]> = {
  fechaTransaccion: ["Fecha Transaccion", "Fecha Transacción", "FechaTransaccion"],
  transaccionId: ["Transaccion", "Transacción", "Transaction"],
  tipoTransaccion: ["Tipo Transaccion", "Tipo Transacción", "TipoTransaccion"],
  numeroEnvio: ["Numero Envio", "Número Envío", "NumeroEnvio"],
  numeroSerie: ["Numero Serie", "Número Serie", "NumeroSerie", "Serial"],
  usuario: ["Usuario", "User"],
  codigoCategoria: ["Codigo Categoria", "Código Categoría", "CodigoCategoria"],
  nombreOrgOrigen: ["Nombre Organizaci", "Nombre Organización Origen", "Nombre Organizacion Origen"],
  subinvOrigen: ["Subinventa rio Origen", "Subinventario Origen"],
  locatorOrigen: ["Locator Origen", "Locat or Orige n"],
  orgDestino: ["Código Organiza ción Destino", "Codigo Organizacion Destino"],
  nombreOrgDestino: ["Nombre Organiza ción Destino", "Nombre Organizacion Destino", "Nombre Organización Destino"],
  subinvDestino: ["Subinve ntario Destino", "Subinventario Destino"],
  locatorDestino: ["Locator Destino", "Locat or Destino"],
  estado: ["Estado", "Status"],
  referenciaTransaccion: ["Referencia Transaccion", "Referencia Transacción"],
  elementosTransaccionados: ["Elementos Transacciona dos", "Elementos Transaccionados"],
  smartCardSerial: ["Sm art Car d Seri al", "SmartCard Serial", "Smart Card"],
  macAddress: ["MAC", "MAC Address"],
  ibsAccountNumber: ["IBS Acc ount Num ber", "IBS Account Number"],
  ridNumber: ["RID"],
};

type ColumnMap = Record<string, string | null>;

function buildOscmColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const headerLower = headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());

  for (const [field, candidates] of Object.entries(OSCM_COLUMNS)) {
    map[field] = null;
    for (const candidate of candidates) {
      const candidateLower = candidate.toLowerCase().replace(/\s+/g, " ").trim();
      const exactIdx = headerLower.indexOf(candidateLower);
      if (exactIdx >= 0) { map[field] = headers[exactIdx]; break; }
      const containsIdx = headerLower.findIndex((h) => h.includes(candidateLower));
      if (containsIdx >= 0) { map[field] = headers[containsIdx]; break; }
    }
  }

  console.log("[REMANUFACTURA PARSER] OSCM column map:", JSON.stringify(map));
  return map;
}

function mapOscmRow(
  row: Record<string, unknown>,
  colMap: ColumnMap,
  headers: string[]
): RemanufacturaTransaccionRow | null {
  const numeroSerie = getVal(row, colMap, "numeroSerie");
  const transaccionId = getVal(row, colMap, "transaccionId");
  if (!numeroSerie && !transaccionId) return null;

  const estado = getVal(row, colMap, "estado");
  const referencia = getVal(row, colMap, "referenciaTransaccion");
  const tipoTx = getVal(row, colMap, "tipoTransaccion");
  const orgDestino = getVal(row, colMap, "orgDestino") || getVal(row, colMap, "nombreOrgDestino");
  const orgOrigen = getVal(row, colMap, "nombreOrgOrigen");

  const falla = inferOscmFault(estado, referencia, tipoTx);
  let resultado: string | null = null;
  if (falla) resultado = falla === "SF" ? "SIN_FALLA" : "CON_FALLA";

  const codigoCategoria = getVal(row, colMap, "codigoCategoria");
  const familia = inferOscmFamily(codigoCategoria, tipoTx, referencia);
  const etapa = inferOscmEtapa(tipoTx, orgDestino, orgOrigen, estado);

  // Raw data for unmapped columns
  const mappedCols = new Set(Object.values(colMap).filter(Boolean));
  const rawData: Record<string, unknown> = {};
  for (const h of headers) {
    if (!mappedCols.has(h) && row[h] !== null && row[h] !== undefined && row[h] !== "") {
      rawData[h] = row[h];
    }
  }

  return {
    fechaTransaccion: parseDate(getVal(row, colMap, "fechaTransaccion")),
    transaccionId,
    tipoTransaccion: tipoTx,
    numeroEnvio: getVal(row, colMap, "numeroEnvio"),
    numeroSerie,
    codigoCategoria,
    familiaEquipo: familia,
    clienteNormalizado: normalizeCliente(orgOrigen) || normalizeCliente(orgDestino),
    orgOrigen,
    nombreOrgOrigen: orgOrigen,
    subinvOrigen: getVal(row, colMap, "subinvOrigen"),
    locatorOrigen: getVal(row, colMap, "locatorOrigen"),
    orgDestino,
    nombreOrgDestino: getVal(row, colMap, "nombreOrgDestino"),
    subinvDestino: getVal(row, colMap, "subinvDestino"),
    locatorDestino: getVal(row, colMap, "locatorDestino"),
    estado,
    falla,
    etapa,
    resultadoDiagnostico: resultado,
    elementosTransaccionados: getNum(row, colMap, "elementosTransaccionados"),
    referenciaTransaccion: referencia,
    usuario: getVal(row, colMap, "usuario"),
    smartCardSerial: getVal(row, colMap, "smartCardSerial"),
    macAddress: getVal(row, colMap, "macAddress"),
    ibsAccountNumber: getVal(row, colMap, "ibsAccountNumber"),
    ridNumber: getVal(row, colMap, "ridNumber"),
    rawData: JSON.stringify(rawData),
  };
}

// ──────────────── Utility functions ────────────────

function str(row: Record<string, unknown>, key: string): string | null {
  const val = row[key];
  if (val === null || val === undefined || val === "" || String(val).trim() === "nan") return null;
  return String(val).trim();
}

function getVal(row: Record<string, unknown>, colMap: ColumnMap, field: string): string | null {
  const col = colMap[field];
  if (!col) return null;
  const val = row[col];
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

function getNum(row: Record<string, unknown>, colMap: ColumnMap, field: string): number {
  const val = getVal(row, colMap, field);
  if (!val) return 0;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n);
}

function parseDate(val: string | null): string | null {
  if (!val) return null;
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    return new Date(val).toISOString();
  }
  // dd/mm/yyyy or d/mm/yyyy with optional time
  const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (match) {
    let year = parseInt(match[3], 10);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const month = match[2].padStart(2, "0");
    const day = match[1].padStart(2, "0");
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }
  // Try native Date parse
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function inferOscmFault(estado: string | null, referencia: string | null, tipo: string | null): string | null {
  const text = [estado, referencia, tipo].filter(Boolean).join(" ").toUpperCase();
  if (text.includes("OXIDO") || text.includes("ÓXIDO")) return "OX";
  if (text.includes("NO ENCIENDE")) return "NE";
  if (text.includes("NO RECIBE") || text.includes("SATELITE")) return "CS";
  if (text.includes("NO RECONOCE") || text.includes("TARJETA")) return "CT";
  if (text.includes("HDMI")) return "HDMI";
  if (text.includes("SOFTWARE")) return "SW";
  if (text.includes("SIN FALLA")) return "SF";
  if (text.includes("FALLA")) return "OTRO";
  return null;
}

function inferOscmFamily(categoria: string | null, tipo: string | null, referencia: string | null): string | null {
  const text = [categoria, tipo, referencia].filter(Boolean).join(" ").toUpperCase();
  if (text.includes("DVR")) return "HD DVR";
  if (text.includes("DECO") || text.includes("HD ONLY")) return "HD ONLY";
  if (text.includes("SD")) return "SD";
  if (text.includes("MODEM")) return "MODEM";
  if (categoria?.toUpperCase() === "DECO") return "HD ONLY";
  return null;
}

function inferOscmEtapa(
  tipo: string | null, destino: string | null, origen: string | null, estado: string | null
): string | null {
  const t = (tipo || "").toUpperCase();
  const e = (estado || "").toUpperCase();
  if (e.includes("DIAGNOSTICO")) return "DIAGNOSTICO";
  if (e.includes("REPARACION")) return "REPARACION";
  if (t.includes("RECEPCION") || t.includes("RECEPCIÓN")) return "INGRESO";
  if (t.includes("DEVOLUCION") && t.includes("LAB")) return "REPARACION";
  if (isLabOrg(destino)) return "DIAGNOSTICO";
  if (isLabOrg(origen) && !isLabOrg(destino)) return "SALIDA";
  return null;
}
