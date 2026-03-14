/**
 * Attendance Calculator
 * Parses biometric clock CSV/TXT/XLSX and calculates OT/tardiness/absences per employee.
 */

import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedAttendanceRow {
  employeeName: string;
  clockIn: Date | null;
  clockOut: Date | null;
  hoursWorked: number;
  date: Date;
}

export interface ShiftConfig {
  startTime: string;   // "HH:mm"
  endTime: string;     // "HH:mm"
  breakMinutes: number;
  effectiveHours: number;
}

export interface DailyAttendanceCalc {
  hoursWorked: number;
  scheduledHours: number;
  overtimeHours: number;
  tardinessMinutes: number;
  isAbsent: boolean;
  isSunday: boolean;
  ot25: number;
  ot35: number;
  ot100: number;
}

export interface AttendancePeriodSummary {
  totalDaysWorked: number;
  totalDaysAbsent: number;
  totalOT25: number;
  totalOT35: number;
  totalOT100: number;
  totalTardinessMinutes: number;
  totalOvertimeHours: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  unmatchedNames: string[];
}

// ── CSV Parser ───────────────────────────────────────────────────────

/**
 * Parses biometric clock CSV.
 * Expected columns: ID, Empleado, Entrada, Salida, Difference, Horas trabajadas, Tipo, Tipo Entrada, Tipo Salida
 * Date format: "2026-01-31 22:03:41"
 */
export function parseAttendanceCSV(csvContent: string): ParsedAttendanceRow[] {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Find header line (skip BOM if present)
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

  // Map column indices
  const colEmpleado = headers.findIndex((h) => h.includes("empleado") || h.includes("employee"));
  const colEntrada = headers.findIndex((h) => h.includes("entrada") || h.includes("entry") || h === "entrada");
  const colSalida = headers.findIndex((h) => h.includes("salida") || h === "salida");
  const colHoras = headers.findIndex((h) => h.includes("horas trabajadas") || h.includes("hours worked") || h.includes("horas"));

  if (colEmpleado === -1 || colEntrada === -1) {
    console.log("[ATTENDANCE] CSV header mapping failed. Headers:", headers);
    return [];
  }

  const rows: ParsedAttendanceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const employeeName = (cols[colEmpleado] || "").trim();
    if (!employeeName) continue;

    const entradaStr = (cols[colEntrada] || "").trim();
    const salidaStr = colSalida >= 0 ? (cols[colSalida] || "").trim() : "";
    const horasStr = colHoras >= 0 ? (cols[colHoras] || "").trim() : "0";

    const clockIn = parseDatetime(entradaStr);
    const clockOut = parseDatetime(salidaStr);
    const hoursWorked = parseFloat(horasStr) || 0;

    // Skip rows where hours = 0 and clockIn equals clockOut (auto-close)
    if (hoursWorked === 0 && clockIn && clockOut && clockIn.getTime() === clockOut.getTime()) {
      continue;
    }

    if (!clockIn) continue;

    // Date is based on clockIn
    const date = new Date(clockIn.getFullYear(), clockIn.getMonth(), clockIn.getDate());

    rows.push({ employeeName, clockIn, clockOut, hoursWorked, date });
  }

  return rows;
}

/**
 * Parses an XLSX file buffer into attendance rows.
 * Uses the first sheet; expects same columns as CSV.
 */
export function parseAttendanceXLSX(buffer: ArrayBuffer): ParsedAttendanceRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (jsonRows.length === 0) return [];

  // Detect columns by header name (keys)
  const firstRow = jsonRows[0];
  const keys = Object.keys(firstRow);

  const colEmpleado = keys.find((k) => {
    const kl = k.toLowerCase();
    return kl.includes("empleado") || kl.includes("employee");
  });
  const colEntrada = keys.find((k) => {
    const kl = k.toLowerCase();
    return kl.includes("entrada") || kl.includes("entry");
  });
  const colSalida = keys.find((k) => {
    const kl = k.toLowerCase();
    return kl.includes("salida");
  });
  const colHoras = keys.find((k) => {
    const kl = k.toLowerCase();
    return kl.includes("horas trabajadas") || kl.includes("hours worked") || kl.includes("horas");
  });

  if (!colEmpleado || !colEntrada) {
    console.log("[ATTENDANCE] XLSX header mapping failed. Keys:", keys);
    return [];
  }

  const rows: ParsedAttendanceRow[] = [];

  for (const row of jsonRows) {
    const employeeName = String(row[colEmpleado] || "").trim();
    if (!employeeName) continue;

    const clockIn = parseXLSXDate(row[colEntrada]);
    const clockOut = colSalida ? parseXLSXDate(row[colSalida]) : null;
    const hoursWorked = colHoras ? parseFloat(String(row[colHoras])) || 0 : 0;

    if (hoursWorked === 0 && clockIn && clockOut && clockIn.getTime() === clockOut.getTime()) {
      continue;
    }

    if (!clockIn) continue;

    const date = new Date(clockIn.getFullYear(), clockIn.getMonth(), clockIn.getDate());
    rows.push({ employeeName, clockIn, clockOut, hoursWorked, date });
  }

  return rows;
}

function parseXLSXDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parses a TXT file (tab or pipe-delimited) into attendance rows.
 * Detects delimiter from first line, then processes like CSV.
 */
export function parseAttendanceTXT(content: string): ParsedAttendanceRow[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, "");

  // Detect delimiter: tab, pipe, or semicolon
  let delimiter = ",";
  if (headerLine.includes("\t")) delimiter = "\t";
  else if (headerLine.includes("|")) delimiter = "|";
  else if (headerLine.includes(";")) delimiter = ";";

  // Convert to CSV format and reuse CSV parser
  const csvContent = lines
    .map((line) => {
      if (delimiter === ",") return line;
      return line.split(delimiter).map((f) => {
        const trimmed = f.trim();
        return trimmed.includes(",") ? `"${trimmed}"` : trimmed;
      }).join(",");
    })
    .join("\n");

  return parseAttendanceCSV(csvContent);
}

/** Parse a single CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Parse "YYYY-MM-DD HH:mm:ss" or similar */
function parseDatetime(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ── Daily Calculation ────────────────────────────────────────────────

/**
 * Calculate OT/tardiness for a single day.
 * @param clockIn actual clock-in time
 * @param clockOut actual clock-out time (nullable)
 * @param hoursWorked total hours worked from biometric (may differ from clockOut - clockIn)
 * @param shift shift configuration
 * @param graceMinutes grace period in minutes (default 5)
 */
export function calculateDailyAttendance(
  clockIn: Date | null,
  clockOut: Date | null,
  hoursWorked: number,
  shift: ShiftConfig,
  graceMinutes: number = 5
): DailyAttendanceCalc {
  const scheduledHours = shift.effectiveHours;
  const isSunday = clockIn ? clockIn.getDay() === 0 : false;

  // If no clock-in at all → absent
  if (!clockIn) {
    return {
      hoursWorked: 0,
      scheduledHours,
      overtimeHours: 0,
      tardinessMinutes: 0,
      isAbsent: true,
      isSunday,
      ot25: 0,
      ot35: 0,
      ot100: 0,
    };
  }

  // Calculate tardiness
  const shiftStartMinutes = parseTimeToMinutes(shift.startTime);
  const clockInMinutes = clockIn.getHours() * 60 + clockIn.getMinutes();
  let tardinessMinutes = 0;

  if (clockInMinutes > shiftStartMinutes + graceMinutes) {
    tardinessMinutes = clockInMinutes - shiftStartMinutes;
  }

  // Calculate overtime
  let overtimeHours = 0;
  let ot25 = 0;
  let ot35 = 0;
  let ot100 = 0;

  if (hoursWorked > scheduledHours) {
    overtimeHours = round2(hoursWorked - scheduledHours);

    if (isSunday) {
      ot100 = overtimeHours;
    } else {
      ot25 = Math.min(overtimeHours, 2);
      ot35 = overtimeHours > 2 ? round2(overtimeHours - 2) : 0;
    }
  }

  return {
    hoursWorked: round2(hoursWorked),
    scheduledHours,
    overtimeHours,
    tardinessMinutes,
    isAbsent: false,
    isSunday,
    ot25: round2(ot25),
    ot35: round2(ot35),
    ot100: round2(ot100),
  };
}

// ── Period Summary ───────────────────────────────────────────────────

export function calculatePeriodSummary(
  records: DailyAttendanceCalc[]
): AttendancePeriodSummary {
  let totalDaysWorked = 0;
  let totalDaysAbsent = 0;
  let totalOT25 = 0;
  let totalOT35 = 0;
  let totalOT100 = 0;
  let totalTardinessMinutes = 0;
  let totalOvertimeHours = 0;

  for (const r of records) {
    if (r.isAbsent) {
      totalDaysAbsent++;
    } else {
      totalDaysWorked++;
    }
    totalOT25 += r.ot25;
    totalOT35 += r.ot35;
    totalOT100 += r.ot100;
    totalTardinessMinutes += r.tardinessMinutes;
    totalOvertimeHours += r.overtimeHours;
  }

  return {
    totalDaysWorked,
    totalDaysAbsent,
    totalOT25: round2(totalOT25),
    totalOT35: round2(totalOT35),
    totalOT100: round2(totalOT100),
    totalTardinessMinutes,
    totalOvertimeHours: round2(totalOvertimeHours),
  };
}

// ── Employee Matching ────────────────────────────────────────────────

/**
 * Match a biometric name to an employee by normalized comparison.
 * Biometric names may have different ordering or extra spaces.
 */
export function matchEmployeeByName<T extends { fullName: string }>(
  biometricName: string,
  employees: T[]
): T | null {
  const normalized = normalizeName(biometricName);
  if (!normalized) return null;

  // Exact normalized match
  for (const emp of employees) {
    if (normalizeName(emp.fullName) === normalized) return emp;
  }

  // Token-set match: all tokens of one name present in the other
  const bioTokens = normalized.split(/\s+/);
  for (const emp of employees) {
    const empTokens = normalizeName(emp.fullName).split(/\s+/);
    // Check if all employee tokens are in biometric name or vice versa
    const allEmpInBio = empTokens.every((t) => bioTokens.includes(t));
    const allBioInEmp = bioTokens.every((t) => empTokens.includes(t));
    if (allEmpInBio || allBioInEmp) return emp;
  }

  return null;
}

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
