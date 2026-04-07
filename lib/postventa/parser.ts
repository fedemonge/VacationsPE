import { PostventaOrdenRow, COLUMN_MAP, DATE_FIELDS, FLOAT_FIELDS, INT_FIELDS } from "./types";

function parseDate(val: string): Date | null {
  if (!val || val.trim() === "" || val === "null" || val === "NULL") return null;
  const trimmed = val.trim();
  // Try ISO format: YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm:ss.ffffff
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // Try date-only: YYYY-MM-DD
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // Try DD/MM/YYYY
  const ddmm = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmm) {
    const d = new Date(`${ddmm[3]}-${ddmm[2]}-${ddmm[1]}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function parseFloat2(val: string): number | null {
  if (!val || val.trim() === "" || val === "-" || val === "null" || val === "NULL") return null;
  const n = parseFloat(val.trim());
  return isNaN(n) ? null : n;
}

function parseInt2(val: string): number | null {
  if (!val || val.trim() === "" || val === "-" || val === "null" || val === "NULL") return null;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? null : n;
}

function getString(val: string): string | null {
  if (!val || val.trim() === "" || val === "null" || val === "NULL") return null;
  return val.trim();
}

export function parsePostventaFile(buffer: Buffer, fileName: string): PostventaOrdenRow[] {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];

  // Detect delimiter — prioritize @ for this file format
  let delimiter = "@";
  if (!headerLine.includes("@")) {
    if (headerLine.includes("\t")) delimiter = "\t";
    else if (headerLine.includes("|")) delimiter = "|";
    else if (headerLine.includes(";")) delimiter = ";";
    else if (headerLine.includes(",")) delimiter = ",";
  }

  const headers = headerLine.split(delimiter).map((h) => h.trim());

  // Build column index map: header position → field name
  const colIndex: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const rawHeader = headers[i];
    // Try exact match first (case-insensitive)
    const lowerHeader = rawHeader.toLowerCase();
    for (const [fileCol, fieldName] of Object.entries(COLUMN_MAP)) {
      if (fileCol.toLowerCase() === lowerHeader) {
        colIndex[i] = fieldName;
        break;
      }
    }
    // Direct match by original key
    if (!colIndex[i] && COLUMN_MAP[rawHeader]) {
      colIndex[i] = COLUMN_MAP[rawHeader];
    }
  }

  const rows: PostventaOrdenRow[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = lines[lineIdx].split(delimiter);
    if (cols.length < 5) continue; // skip malformed lines

    const raw: Record<string, string> = {};
    for (let i = 0; i < cols.length; i++) {
      const field = colIndex[i];
      if (field) raw[field] = cols[i];
    }

    // Skip rows without an ODS number
    if (!raw.odsNumero || raw.odsNumero.trim() === "") continue;

    // Build typed row
    const row: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(raw)) {
      if (DATE_FIELDS.has(field)) {
        row[field] = parseDate(value);
      } else if (FLOAT_FIELDS.has(field)) {
        row[field] = parseFloat2(value);
      } else if (INT_FIELDS.has(field)) {
        row[field] = parseInt2(value);
      } else {
        row[field] = getString(value);
      }
    }

    rows.push(row as unknown as PostventaOrdenRow);
  }

  return rows;
}
