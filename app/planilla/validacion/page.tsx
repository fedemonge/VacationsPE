"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface Employee {
  name: string;
  area: string;
  cargo: string;
  baseSalary: number;
  otHours: number;
  otValue: number;
  commission: number;
  bonusProduction: number;
  bonusMobility: number;
  netPay: number;
  _raw: Record<string, unknown>;
}

interface BiometricEntry { name: string; otHours: number }

interface BioCrossResult {
  employee: string; area: string; otReloj: number; otPlanilla: number;
  delta: number; valorPlanilla: number;
  status: "CRITICO" | "ALERTA" | "OK" | "SUBPAGO" | "REVISAR";
}

interface HEVariation {
  employee: string; area: string;
  hePrev: number; heCurr: number; deltaHrs: number;
  valPrev: number; valCurr: number; deltaVal: number;
}

interface PersonnelMove { name: string; area: string; cargo: string; salary: number }

interface SalaryChange {
  name: string; area: string;
  prevSalary: number; currSalary: number; deltaSalary: number;
  prevBonus: number; currBonus: number; deltaBonus: number;
}

interface BonusByArea { area: string; employees: number; totalPrev: number; totalCurr: number; delta: number }

interface AreaCommission { area: string; totalPrev: number; totalCurr: number; delta: number }

interface OTByArea { area: string; hrsCurr: number; hrsPrev: number; valCurr: number; valPrev: number }

interface ValidationReport {
  month: string; prevMonth: string; generatedAt: string;
  monthIdx: number; year: number;
  activeCount: number; newHires: PersonnelMove[]; terminations: PersonnelMove[];
  salaryChanges: SalaryChange[];
  totalNetCurr: number; totalNetPrev: number;
  totalOTValueCurr: number; totalOTValuePrev: number;
  totalOTHrsCurr: number; totalOTHrsPrev: number;
  totalCommCurr: number; totalCommPrev: number;
  totalBonusProdCurr: number; totalBonusProdPrev: number;
  totalBonusMobCurr: number; totalBonusMobPrev: number;
  bioCross: BioCrossResult[];
  bioNoReloj: { employee: string; area: string; otPlanilla: number; valor: number }[];
  bioStats: { critico: number; alerta: number; ok: number; subpago: number; revisar: number };
  montoEnRiesgo: number; montoSinReloj: number;
  topOT: { employee: string; area: string; hrs: number; value: number }[];
  heVariations: HEVariation[];
  bonusByArea: BonusByArea[];
  commByArea: AreaCommission[];
  otByArea: OTByArea[];
  /* exceptions */
  exceptions: ExceptionItem[];
}

interface ExceptionItem {
  severity: "CRITICA" | "ALTA" | "MEDIA";
  category: string;
  description: string;
  employees?: string[];
  amount?: number;
}

/** Stored monthly snapshot for trend analysis */
interface MonthSnapshot {
  label: string; // "Enero 2026"
  monthIdx: number;
  year: number;
  activeCount: number;
  newHires: number;
  terminations: number;
  totalNet: number;
  totalOTHrs: number;
  totalOTValue: number;
  totalComm: number;
  totalBonusProd: number;
  totalBonusMob: number;
  bioStats: { critico: number; alerta: number; ok: number; subpago: number; revisar: number };
  montoEnRiesgo: number;
  otByArea: OTByArea[];
}

type Tab = "upload" | "resumen" | "biometrico" | "he" | "comisiones" | "personal" | "salarios" | "excepciones" | "tendencias" | "exportar";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TABS: { id: Tab; label: string }[] = [
  { id: "upload", label: "Cargar Archivos" },
  { id: "resumen", label: "Resumen" },
  { id: "biometrico", label: "Biometrico" },
  { id: "he", label: "Horas Extras" },
  { id: "comisiones", label: "Comisiones" },
  { id: "personal", label: "Personal" },
  { id: "salarios", label: "Salarios" },
  { id: "excepciones", label: "Excepciones" },
  { id: "tendencias", label: "Tendencias" },
  { id: "exportar", label: "Exportar" },
];

const CHART_COLORS = ["#EA7704", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#06b6d4", "#f43f5e", "#eab308", "#14b8a6", "#ec4899"];
const PIE_COLORS = { CRITICO: "#ef4444", ALERTA: "#f97316", OK: "#22c55e", SUBPAGO: "#3b82f6", "SIN RELOJ": "#94a3b8" };

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "0.0%" : "+100%";
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function normalizeName(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) { const bg = s.slice(i, i + 2); m.set(bg, (m.get(bg) || 0) + 1); }
    return m;
  };
  const bg1 = bigrams(na), bg2 = bigrams(nb);
  let matches = 0;
  for (const [k, v] of Array.from(bg1)) matches += Math.min(v, bg2.get(k) || 0);
  return (2 * matches) / (na.length - 1 + nb.length - 1);
}

/* ═══════════════════════════════════════════
   EXCEL PARSING
   ═══════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let XLSX_LIB: any = null;
async function loadXLSX() {
  if (XLSX_LIB) return XLSX_LIB;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("xlsx") as any;
  XLSX_LIB = mod.default || mod;
  return XLSX_LIB;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ParsedSheet { name: string; rows: Record<string, any>[] }

interface ParseResult { sheets: ParsedSheet[]; rawSheets: Record<string, unknown>; xlsxLib: unknown }

async function parseExcel(file: File): Promise<ParseResult> {
  const xlsx = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = xlsx.read(buf, { type: "array" });
  const sheets = wb.SheetNames.map((name: string) => ({
    name,
    rows: xlsx.utils.sheet_to_json(wb.Sheets[name], { defval: "" }),
  }));
  const rawSheets: Record<string, unknown> = {};
  for (const name of wb.SheetNames) rawSheets[name] = wb.Sheets[name];
  return { sheets, rawSheets, xlsxLib: xlsx };
}

function findCol(headers: string[], ...candidates: string[]): string | null {
  const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9%\s/]/g, "").trim();
  // Exact substring match first
  for (const c of candidates) {
    const cn = norm(c);
    const found = headers.find((h) => {
      const hn = norm(h);
      return hn === cn || hn.includes(cn) || cn.includes(hn);
    });
    if (found) return found;
  }
  // Word-based match: any candidate word appears in header
  for (const c of candidates) {
    const words = norm(c).split(/\s+/).filter((w) => w.length > 2);
    const found = headers.find((h) => {
      const hn = norm(h);
      return words.every((w) => hn.includes(w));
    });
    if (found) return found;
  }
  return null;
}

/** Try to find the real header row in a sheet (handles title/metadata rows above the data) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findHeaderRow(xlsx: any, sheet: any): { headers: string[]; rows: Record<string, any>[] } {
  // Try parsing with different header rows (0-based offset)
  for (let headerRow = 0; headerRow < 10; headerRow++) {
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", range: headerRow });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]).filter((h) => !h.startsWith("__EMPTY"));
    // A real header row has multiple named columns (not __EMPTY) and some look like payroll fields
    const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const payrollKeywords = ["NOMBRE", "APELLIDO", "TRABAJADOR", "EMPLEADO", "BASICO", "NETO", "AREA", "CARGO", "SUELDO", "REMUNERACION", "TOTAL", "HORAS", "BONO", "COMISION", "DESCUENTO", "INGRESO"];
    const matchCount = headers.filter((h) => payrollKeywords.some((kw) => norm(h).includes(kw))).length;
    if (matchCount >= 3) return { headers, rows };
  }
  // Fallback: use first row as headers
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  return { headers: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
}

function parseEmployees(sheets: ParsedSheet[], xlsxLib?: unknown, rawSheets?: Record<string, unknown>): Employee[] {
  // Try each sheet, picking the one with most payroll-like columns
  let bestSheet: ParsedSheet | null = null;
  let bestScore = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bestParsed: { headers: string[]; rows: Record<string, any>[] } | null = null;

  for (const s of sheets) {
    if (s.rows.length === 0) continue;

    // If we have the raw xlsx lib + sheet objects, try smart header detection
    let headers: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: Record<string, any>[];

    if (xlsxLib && rawSheets && rawSheets[s.name]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = findHeaderRow(xlsxLib as any, rawSheets[s.name]);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      headers = Object.keys(s.rows[0]);
      rows = s.rows;
    }

    const norm = (h: string) => h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nameKeywords = ["NOMBRE", "APELLIDO", "TRABAJADOR", "EMPLEADO"];
    const payKeywords = ["BASICO", "NETO", "SUELDO", "REMUNERACION", "TOTAL", "PAGAR", "LIQUIDO"];
    const hasName = headers.some((h) => nameKeywords.some((kw) => norm(h).includes(kw)));
    const payCount = headers.filter((h) => payKeywords.some((kw) => norm(h).includes(kw))).length;
    const score = (hasName ? 10 : 0) + payCount + (rows.length > 10 ? 5 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestSheet = { name: s.name, rows };
      bestParsed = { headers, rows };
    }
  }

  if (!bestSheet || !bestParsed || bestParsed.rows.length === 0) return [];

  const headers = bestParsed.headers;
  const rows = bestParsed.rows;

  // Flexible column detection with many aliases
  const colName = findCol(headers, "APELLIDOS Y NOMBRES", "TRABAJADOR", "NOMBRES Y APELLIDOS", "NOMBRE COMPLETO", "NOMBRE DEL EMPLEADO", "NOMBRE DEL TRABAJADOR", "NOMBRE", "EMPLEADO", "NOMBRES");
  const colArea = findCol(headers, "AREA", "CENTRO DE COSTO", "CENTRO COSTO", "DEPARTAMENTO", "CC", "SECCION", "UNIDAD");
  const colCargo = findCol(headers, "CARGO", "PUESTO", "POSICION", "PUESTO DE TRABAJO", "OCUPACION");
  const colBaseSalary = findCol(headers, "BASICO", "SUELDO BASICO", "REMUNERACION BASICA", "REM BASICA", "SALARIO", "SUELDO", "REMUNERACION", "REM. BASICA", "HABER BASICO");
  const colOTHrs = findCol(headers, "TOTAL HE", "HRS EXTRAS", "HORAS EXTRAS", "HE TOTAL", "TOTAL HORAS EXTRAS", "HE 25%", "TOTAL H.E.", "HORAS EXTRA");
  const colOTVal = findCol(headers, "VALOR HE", "MONTO HE", "HE VALOR", "TOTAL HE S/", "IMPORTE HE", "MONTO HORAS EXTRAS");
  const colComm = findCol(headers, "COMISION", "COMISIONES", "COM RECUPERO", "COM. RECUPERO", "COMISION RECUPERO");
  const colBonusProd = findCol(headers, "BONO PRODUCCION", "BONO PROD", "BONO", "BONIFICACION", "BONIF PRODUCCION");
  const colBonusMob = findCol(headers, "BONO MOVILIDAD", "MOVILIDAD", "ASIG MOVILIDAD", "ASIGNACION MOVILIDAD");
  const colNet = findCol(headers, "NETO A PAGAR", "NETO", "TOTAL NETO", "LIQUIDO", "NETO PAGAR", "MONTO NETO", "IMPORTE NETO");

  // If we couldn't find OT hours but have OT 25%/35%/100%, sum them
  const colOT25 = !colOTHrs ? findCol(headers, "HE 25%", "HE AL 25%", "SOBRE TIEMPO 25%") : null;
  const colOT35 = !colOTHrs ? findCol(headers, "HE 35%", "HE AL 35%", "SOBRE TIEMPO 35%") : null;
  const colOT100 = !colOTHrs ? findCol(headers, "HE 100%", "HE AL 100%", "SOBRE TIEMPO 100%") : null;

  // If no name column found, try to auto-detect: column with most all-uppercase multi-word text values
  let nameCol = colName;
  if (!nameCol) {
    let bestNameScore = 0;
    for (const h of headers) {
      const sample = rows.slice(0, 20).map((r) => String(r[h] || "").trim()).filter(Boolean);
      const upperMultiWord = sample.filter((s) => s === s.toUpperCase() && s.split(/\s+/).length >= 2 && /^[A-Z\s]+$/.test(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
      if (upperMultiWord.length > bestNameScore) { bestNameScore = upperMultiWord.length; nameCol = h; }
    }
  }

  if (!nameCol) return [];

  return rows
    .filter((r) => r[nameCol!] && String(r[nameCol!]).trim() && String(r[nameCol!]).trim().length > 3)
    .map((r) => {
      let otHrs = 0;
      if (colOTHrs) { otHrs = Number(r[colOTHrs]) || 0; }
      else { otHrs = (Number(colOT25 ? r[colOT25] : 0) || 0) + (Number(colOT35 ? r[colOT35] : 0) || 0) + (Number(colOT100 ? r[colOT100] : 0) || 0); }

      return {
        name: String(r[nameCol!]).trim(),
        area: String(colArea ? r[colArea] : "").trim(),
        cargo: String(colCargo ? r[colCargo] : "").trim(),
        baseSalary: Number(colBaseSalary ? r[colBaseSalary] : 0) || 0,
        otHours: otHrs,
        otValue: Number(colOTVal ? r[colOTVal] : 0) || 0,
        commission: Number(colComm ? r[colComm] : 0) || 0,
        bonusProduction: Number(colBonusProd ? r[colBonusProd] : 0) || 0,
        bonusMobility: Number(colBonusMob ? r[colBonusMob] : 0) || 0,
        netPay: Number(colNet ? r[colNet] : 0) || 0,
        _raw: r,
      };
    });
}

function parseBiometric(sheets: ParsedSheet[]): BiometricEntry[] {
  const sheet = sheets.find((s) => /resumen|overtime|he|horas|asistencia|attendance/i.test(s.name)) || sheets[0];
  if (!sheet || sheet.rows.length === 0) return [];
  const headers = Object.keys(sheet.rows[0]);
  const colName = findCol(headers, "EMPLEADO", "NOMBRE", "TRABAJADOR", "APELLIDOS Y NOMBRES", "NAME OF EMPLOYEE", "NOMBRE DEL EMPLEADO");
  const colHours = findCol(headers, "HORAS TRABAJADAS", "DIFFERENCE", "TOTAL HE", "HRS EXTRAS", "HORAS EXTRAS", "HORAS", "TOTAL");

  if (!colName) return [];

  // Check if this is a daily attendance file (multiple rows per employee) or a summary
  const nameValues = sheet.rows.map((r) => String(r[colName!] || "").trim()).filter(Boolean);
  const uniqueNames = new Set(nameValues).size;
  const isDaily = nameValues.length > uniqueNames * 2; // Many more rows than unique names = daily records

  if (isDaily && colHours) {
    // Daily attendance records: group by employee, calculate OT per day (hours > 8 = OT)
    const STANDARD_HOURS = 8;
    const empMap = new Map<string, { totalOT: number; days: number }>();
    for (const r of sheet.rows) {
      const name = String(r[colName!]).trim();
      if (!name) continue;
      const hoursWorked = Number(r[colHours]) || 0;
      if (hoursWorked <= 0) continue;
      const entry = empMap.get(name) || { totalOT: 0, days: 0 };
      entry.days++;
      if (hoursWorked > STANDARD_HOURS) entry.totalOT += hoursWorked - STANDARD_HOURS;
      empMap.set(name, entry);
    }
    return Array.from(empMap.entries())
      .map(([name, data]) => ({ name, otHours: Math.round(data.totalOT * 100) / 100 }));
  }

  // Summary format: one row per employee with total OT
  if (colHours) {
    // If it's a summary, each row is one employee with total OT
    const empMap = new Map<string, number>();
    for (const r of sheet.rows) {
      const name = String(r[colName!]).trim();
      if (!name) continue;
      const hrs = Number(r[colHours]) || 0;
      empMap.set(name, (empMap.get(name) || 0) + hrs);
    }
    return Array.from(empMap.entries()).map(([name, otHours]) => ({ name, otHours }));
  }

  // Fallback: try to sum any numeric columns
  const map = new Map<string, number>();
  for (const r of sheet.rows) {
    const name = String(r[colName!]).trim();
    if (!name) continue;
    let total = 0;
    for (const [k, v] of Object.entries(r)) {
      if (k === colName) continue;
      const n = Number(v);
      if (!isNaN(n) && n > 0 && n < 24) total += n;
    }
    map.set(name, (map.get(name) || 0) + total);
  }
  return Array.from(map.entries()).map(([name, otHours]) => ({ name, otHours }));
}

/* ═══════════════════════════════════════════
   VALIDATION ENGINE
   ═══════════════════════════════════════════ */

function runValidation(
  curr: Employee[], prev: Employee[], bioCurr: BiometricEntry[],
  yearVal: number, monthVal: number,
): ValidationReport {
  const monthLabel = MONTHS[monthVal - 1] || "Mes";
  const prevMonthLabel = monthVal === 1 ? `Diciembre ${yearVal - 1}` : MONTHS[monthVal - 2];

  const prevByName = new Map<string, Employee>();
  for (const e of prev) prevByName.set(normalizeName(e.name), e);
  const currByName = new Map<string, Employee>();
  for (const e of curr) currByName.set(normalizeName(e.name), e);

  // ── Personnel ──
  const newHires: PersonnelMove[] = [];
  const terminations: PersonnelMove[] = [];
  for (const e of curr) {
    const key = normalizeName(e.name);
    if (!prevByName.has(key)) {
      let found = false;
      for (const pk of Array.from(prevByName.keys())) { if (similarity(key, pk) > 0.85) { found = true; break; } }
      if (!found) newHires.push({ name: e.name, area: e.area, cargo: e.cargo, salary: e.baseSalary });
    }
  }
  for (const e of prev) {
    const key = normalizeName(e.name);
    if (!currByName.has(key)) {
      let found = false;
      for (const ck of Array.from(currByName.keys())) { if (similarity(key, ck) > 0.85) { found = true; break; } }
      if (!found) terminations.push({ name: e.name, area: e.area, cargo: e.cargo, salary: e.baseSalary });
    }
  }

  // ── Salary changes ──
  const salaryChanges: SalaryChange[] = [];
  for (const e of curr) {
    const key = normalizeName(e.name);
    let match: Employee | undefined = prevByName.get(key);
    if (!match) { for (const [pk, pe] of Array.from(prevByName)) { if (similarity(key, pk) > 0.85) { match = pe; break; } } }
    if (match && (Math.abs(e.baseSalary - match.baseSalary) > 0.01 || Math.abs(e.bonusProduction - match.bonusProduction) > 0.01)) {
      salaryChanges.push({
        name: e.name, area: e.area,
        prevSalary: match.baseSalary, currSalary: e.baseSalary, deltaSalary: e.baseSalary - match.baseSalary,
        prevBonus: match.bonusProduction, currBonus: e.bonusProduction, deltaBonus: e.bonusProduction - match.bonusProduction,
      });
    }
  }

  // ── Biometric ──
  const bioCross: BioCrossResult[] = [];
  const bioNoReloj: { employee: string; area: string; otPlanilla: number; valor: number }[] = [];
  const bioMap = new Map<string, BiometricEntry>();
  for (const b of bioCurr) bioMap.set(normalizeName(b.name), b);

  for (const e of curr) {
    if (e.otHours <= 0) continue;
    const key = normalizeName(e.name);
    let bioMatch: BiometricEntry | undefined = bioMap.get(key);
    if (!bioMatch) {
      let bestScore = 0; let bestEntry: BiometricEntry | undefined;
      for (const [bk, be] of Array.from(bioMap)) { const s = similarity(key, bk); if (s > bestScore && s > 0.75) { bestScore = s; bestEntry = be; } }
      bioMatch = bestEntry;
    }
    if (!bioMatch) { bioNoReloj.push({ employee: e.name, area: e.area, otPlanilla: e.otHours, valor: e.otValue }); continue; }
    const delta = e.otHours - bioMatch.otHours;
    const status: BioCrossResult["status"] = delta > 10 ? "CRITICO" : delta > 2 ? "ALERTA" : delta >= -2 ? "OK" : "SUBPAGO";
    bioCross.push({ employee: e.name, area: e.area, otReloj: bioMatch.otHours, otPlanilla: e.otHours, delta, valorPlanilla: e.otValue, status });
  }
  for (const [bk, be] of Array.from(bioMap)) {
    if (be.otHours <= 2) continue;
    const alreadyMatched = bioCross.some((bc) => similarity(normalizeName(bc.employee), bk) > 0.75);
    if (alreadyMatched) continue;
    let matchedEmp: Employee | undefined;
    for (const e of curr) { if (similarity(normalizeName(e.name), bk) > 0.75) { matchedEmp = e; break; } }
    if (matchedEmp && matchedEmp.otHours === 0) {
      bioCross.push({ employee: matchedEmp.name, area: matchedEmp.area, otReloj: be.otHours, otPlanilla: 0, delta: -be.otHours, valorPlanilla: 0, status: "SUBPAGO" });
    }
  }
  bioCross.sort((a, b) => b.delta - a.delta);

  const bioStats = {
    critico: bioCross.filter((b) => b.status === "CRITICO").length,
    alerta: bioCross.filter((b) => b.status === "ALERTA").length,
    ok: bioCross.filter((b) => b.status === "OK").length,
    subpago: bioCross.filter((b) => b.status === "SUBPAGO").length,
    revisar: bioNoReloj.length,
  };
  const montoEnRiesgo = bioCross.filter((b) => b.status === "CRITICO").reduce((s, b) => s + b.valorPlanilla, 0);
  const montoSinReloj = bioNoReloj.reduce((s, b) => s + b.valor, 0);

  // ── OT ──
  const topOT = [...curr].filter((e) => e.otHours > 0).sort((a, b) => b.otHours - a.otHours).slice(0, 15)
    .map((e) => ({ employee: e.name, area: e.area, hrs: e.otHours, value: e.otValue }));

  const heVariations: HEVariation[] = [];
  for (const e of curr) {
    const key = normalizeName(e.name);
    let match: Employee | undefined = prevByName.get(key);
    if (!match) { for (const [pk, pe] of Array.from(prevByName)) { if (similarity(key, pk) > 0.85) { match = pe; break; } } }
    const prevHE = match?.otHours || 0;
    const deltaHrs = e.otHours - prevHE;
    if (Math.abs(deltaHrs) > 3) {
      heVariations.push({ employee: e.name, area: e.area, hePrev: prevHE, heCurr: e.otHours, deltaHrs, valPrev: match?.otValue || 0, valCurr: e.otValue, deltaVal: e.otValue - (match?.otValue || 0) });
    }
  }
  for (const e of prev) {
    if (e.otHours <= 3) continue;
    const key = normalizeName(e.name);
    let foundInCurr = false;
    for (const ce of curr) { if (normalizeName(ce.name) === key || similarity(normalizeName(ce.name), key) > 0.85) { foundInCurr = true; break; } }
    if (!foundInCurr) {
      heVariations.push({ employee: e.name, area: e.area, hePrev: e.otHours, heCurr: 0, deltaHrs: -e.otHours, valPrev: e.otValue, valCurr: 0, deltaVal: -e.otValue });
    }
  }
  heVariations.sort((a, b) => Math.abs(b.deltaHrs) - Math.abs(a.deltaHrs));

  // ── Bonuses by area ──
  const bonusAreaMap = new Map<string, { employees: Set<string>; totalCurr: number; totalPrev: number }>();
  for (const e of curr) { if (e.bonusProduction <= 0) continue; const k = e.area || "SIN AREA"; const en = bonusAreaMap.get(k) || { employees: new Set<string>(), totalCurr: 0, totalPrev: 0 }; en.employees.add(e.name); en.totalCurr += e.bonusProduction; bonusAreaMap.set(k, en); }
  for (const e of prev) { if (e.bonusProduction <= 0) continue; const k = e.area || "SIN AREA"; const en = bonusAreaMap.get(k) || { employees: new Set<string>(), totalCurr: 0, totalPrev: 0 }; en.totalPrev += e.bonusProduction; bonusAreaMap.set(k, en); }
  const bonusByArea: BonusByArea[] = Array.from(bonusAreaMap.entries())
    .map(([area, d]) => ({ area, employees: d.employees.size, totalPrev: d.totalPrev, totalCurr: d.totalCurr, delta: d.totalCurr - d.totalPrev }))
    .sort((a, b) => b.totalCurr - a.totalCurr);

  // ── Commissions by area ──
  const commAreaMap = new Map<string, { totalCurr: number; totalPrev: number }>();
  for (const e of curr) { if (e.commission <= 0) continue; const k = e.area || "SIN AREA"; const en = commAreaMap.get(k) || { totalCurr: 0, totalPrev: 0 }; en.totalCurr += e.commission; commAreaMap.set(k, en); }
  for (const e of prev) { if (e.commission <= 0) continue; const k = e.area || "SIN AREA"; const en = commAreaMap.get(k) || { totalCurr: 0, totalPrev: 0 }; en.totalPrev += e.commission; commAreaMap.set(k, en); }
  const commByArea: AreaCommission[] = Array.from(commAreaMap.entries())
    .map(([area, d]) => ({ area, totalPrev: d.totalPrev, totalCurr: d.totalCurr, delta: d.totalCurr - d.totalPrev }))
    .sort((a, b) => b.totalCurr - a.totalCurr);

  // ── OT by area ──
  const otAreaMap = new Map<string, { hrsCurr: number; hrsPrev: number; valCurr: number; valPrev: number }>();
  for (const e of curr) { if (e.otHours <= 0) continue; const k = e.area || "SIN AREA"; const en = otAreaMap.get(k) || { hrsCurr: 0, hrsPrev: 0, valCurr: 0, valPrev: 0 }; en.hrsCurr += e.otHours; en.valCurr += e.otValue; otAreaMap.set(k, en); }
  for (const e of prev) { if (e.otHours <= 0) continue; const k = e.area || "SIN AREA"; const en = otAreaMap.get(k) || { hrsCurr: 0, hrsPrev: 0, valCurr: 0, valPrev: 0 }; en.hrsPrev += e.otHours; en.valPrev += e.otValue; otAreaMap.set(k, en); }
  const otByArea: OTByArea[] = Array.from(otAreaMap.entries())
    .map(([area, d]) => ({ area, ...d }))
    .sort((a, b) => b.hrsCurr - a.hrsCurr);

  // ── Aggregates ──
  const sum = (arr: Employee[], fn: (e: Employee) => number) => arr.reduce((s, e) => s + fn(e), 0);
  const totalOTHrsCurr = sum(curr, (e) => e.otHours);
  const totalOTHrsPrev = sum(prev, (e) => e.otHours);

  // ── Exception Reporting ──
  const exceptions: ExceptionItem[] = [];

  // Biometric criticos
  if (bioStats.critico > 0) {
    exceptions.push({
      severity: "CRITICA", category: "Biometrico",
      description: `${bioStats.critico} empleados con HE en planilla significativamente mayores al reloj. Monto en riesgo: ${fmt(montoEnRiesgo)}.`,
      employees: bioCross.filter((b) => b.status === "CRITICO").slice(0, 5).map((b) => b.employee),
      amount: montoEnRiesgo,
    });
  }

  // Employees with >50 HE (potential labor law violation: Peru max is 48hrs/week work)
  const over50HE = curr.filter((e) => e.otHours > 50);
  if (over50HE.length > 0) {
    exceptions.push({
      severity: "CRITICA", category: "Cumplimiento Laboral",
      description: `${over50HE.length} empleados superan 50 HE mensuales. Riesgo de infraccion SUNAFIL.`,
      employees: over50HE.map((e) => `${e.name} (${e.otHours} hrs)`),
    });
  }

  // Large OT spike
  if (totalOTHrsPrev > 0 && totalOTHrsCurr > totalOTHrsPrev * 1.3) {
    exceptions.push({
      severity: "ALTA", category: "Horas Extras",
      description: `Horas extras aumentaron ${pct(totalOTHrsCurr, totalOTHrsPrev)} (${totalOTHrsPrev} -> ${totalOTHrsCurr} hrs). Incremento de ${fmt(sum(curr, (e) => e.otValue) - sum(prev, (e) => e.otValue))}.`,
    });
  }

  // Employees going from 0 HE to >30 HE
  const suddenOT = heVariations.filter((v) => v.hePrev === 0 && v.heCurr > 30);
  if (suddenOT.length > 0) {
    exceptions.push({
      severity: "ALTA", category: "Horas Extras",
      description: `${suddenOT.length} empleados pasaron de 0 HE a mas de 30 HE en un mes.`,
      employees: suddenOT.slice(0, 8).map((v) => `${v.employee} (+${v.deltaHrs} hrs)`),
    });
  }

  // High turnover rate
  const turnoverRate = (newHires.length + terminations.length) / (curr.length || 1);
  if (turnoverRate > 0.15) {
    exceptions.push({
      severity: "ALTA", category: "Rotacion",
      description: `Tasa de rotacion ${(turnoverRate * 100).toFixed(1)}% — ${newHires.length} ingresos + ${terminations.length} ceses sobre ${curr.length} activos.`,
    });
  }

  // Areas with no biometric but paying OT
  const areasNoReloj = new Map<string, number>();
  for (const b of bioNoReloj) { areasNoReloj.set(b.area, (areasNoReloj.get(b.area) || 0) + b.valor); }
  for (const [area, val] of Array.from(areasNoReloj)) {
    if (val > 200) {
      exceptions.push({
        severity: "MEDIA", category: "Biometrico",
        description: `Area "${area}" paga HE (${fmt(val)}) sin registro en reloj biometrico.`,
      });
    }
  }

  // Commission drops > 15%
  for (const c of commByArea) {
    if (c.totalPrev > 500 && c.delta < 0 && Math.abs(c.delta / c.totalPrev) > 0.15) {
      exceptions.push({
        severity: "MEDIA", category: "Comisiones",
        description: `Comisiones en "${c.area}" cayeron ${pct(c.totalCurr, c.totalPrev)} (${fmt(c.totalPrev)} -> ${fmt(c.totalCurr)}).`,
        amount: Math.abs(c.delta),
      });
    }
  }

  exceptions.sort((a, b) => {
    const order = { CRITICA: 0, ALTA: 1, MEDIA: 2 };
    return order[a.severity] - order[b.severity];
  });

  return {
    month: monthLabel, prevMonth: prevMonthLabel, generatedAt: new Date().toLocaleString("es-PE"),
    monthIdx: monthVal, year: yearVal,
    activeCount: curr.length, newHires, terminations, salaryChanges,
    totalNetCurr: sum(curr, (e) => e.netPay), totalNetPrev: sum(prev, (e) => e.netPay),
    totalOTValueCurr: sum(curr, (e) => e.otValue), totalOTValuePrev: sum(prev, (e) => e.otValue),
    totalOTHrsCurr, totalOTHrsPrev,
    totalCommCurr: sum(curr, (e) => e.commission), totalCommPrev: sum(prev, (e) => e.commission),
    totalBonusProdCurr: sum(curr, (e) => e.bonusProduction), totalBonusProdPrev: sum(prev, (e) => e.bonusProduction),
    totalBonusMobCurr: sum(curr, (e) => e.bonusMobility), totalBonusMobPrev: sum(prev, (e) => e.bonusMobility),
    bioCross, bioNoReloj, bioStats, montoEnRiesgo, montoSinReloj,
    topOT, heVariations, bonusByArea, commByArea, otByArea, exceptions,
  };
}

/* ═══════════════════════════════════════════
   HTML EXPORT (dark theme)
   ═══════════════════════════════════════════ */

function generateHTML(r: ValidationReport): string {
  const ml = `${r.month} ${r.year}`;
  const pl = r.monthIdx === 1 ? `Diciembre ${r.year - 1}` : `${r.prevMonth} ${r.year}`;
  const criticosRows = r.bioCross.filter((b) => b.status === "CRITICO").map((b) => `<tr><td>${b.employee}</td><td>${b.area}</td><td>${b.otReloj.toFixed(1)}</td><td>${b.otPlanilla.toFixed(1)}</td><td style="color:#ef4444;font-weight:700">+${b.delta.toFixed(1)}</td><td>${fmt(b.valorPlanilla)}</td><td><span class="badge badge-red">CRITICO</span></td></tr>`).join("");
  const alertaRows = r.bioCross.filter((b) => b.status === "ALERTA").map((b) => `<tr><td>${b.employee}</td><td>${b.area}</td><td>${b.otReloj.toFixed(1)}</td><td>${b.otPlanilla.toFixed(1)}</td><td style="color:#ef4444;font-weight:700">+${b.delta.toFixed(1)}</td><td>${fmt(b.valorPlanilla)}</td><td><span class="badge badge-yellow">ALERTA</span></td></tr>`).join("");
  const subpagoRows = r.bioCross.filter((b) => b.status === "SUBPAGO").map((b) => `<tr><td>${b.employee}</td><td>${b.area}</td><td>${b.otReloj.toFixed(1)}</td><td>${b.otPlanilla.toFixed(1)}</td><td style="color:#22c55e;font-weight:700">${b.delta.toFixed(1)}</td><td>${fmt(b.valorPlanilla)}</td><td><span class="badge badge-blue">SUBPAGO</span></td></tr>`).join("");
  const noRelojRows = r.bioNoReloj.map((b) => `<tr><td>${b.employee}</td><td>${b.area}</td><td>${b.otPlanilla.toFixed(1)}</td><td>${fmt(b.valor)}</td></tr>`).join("");
  const topOTRows = r.topOT.map((o, i) => `<tr><td>${i + 1}</td><td>${o.employee}</td><td>${o.area}</td><td>${o.hrs}</td><td>${fmt(o.value)}</td></tr>`).join("");
  const heVarRows = r.heVariations.slice(0, 30).map((v) => { const c = v.deltaHrs > 0 ? "#ef4444" : "#22c55e"; return `<tr><td>${v.employee}</td><td>${v.area}</td><td>${v.hePrev}</td><td>${v.heCurr}</td><td style="color:${c};font-weight:600">${v.deltaHrs > 0 ? "+" : ""}${v.deltaHrs}</td><td>${fmt(v.valPrev)}</td><td>${fmt(v.valCurr)}</td><td style="color:${c}">${v.deltaVal >= 0 ? "+" : ""}${fmt(v.deltaVal)}</td></tr>`; }).join("");
  const newHireRows = r.newHires.map((h) => `<tr><td>${h.name}</td><td>${h.area}</td><td>${h.cargo}</td><td>${fmt(h.salary)}</td></tr>`).join("");
  const termRows = r.terminations.map((t) => `<tr><td>${t.name}</td><td>${t.area}</td><td>${t.cargo}</td><td>${fmt(t.salary)}</td></tr>`).join("");
  const salaryRows = r.salaryChanges.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:#22c55e;padding:20px">Sin cambios salariales este mes</td></tr>` : r.salaryChanges.map((s) => `<tr><td>${s.name}</td><td>${s.area}</td><td>${fmt(s.prevSalary)}</td><td>${fmt(s.currSalary)}</td><td style="color:${s.deltaSalary >= 0 ? "#22c55e" : "#ef4444"}">${s.deltaSalary >= 0 ? "+" : ""}${fmt(s.deltaSalary)}</td><td>${s.deltaBonus >= 0 ? "+" : ""}${fmt(s.deltaBonus)}</td></tr>`).join("");
  const bonusRows = r.bonusByArea.map((b) => `<tr><td>${b.area}</td><td>${b.employees}</td><td>${fmt(b.totalPrev)}</td><td>${fmt(b.totalCurr)}</td><td style="color:${b.delta >= 0 ? "#22c55e" : "#ef4444"}">${b.delta >= 0 ? "+" : ""}${fmt(b.delta)}</td></tr>`).join("");
  const exceptionRows = r.exceptions.map((e) => { const bg = e.severity === "CRITICA" ? "#450a0a" : e.severity === "ALTA" ? "#422006" : "#0c1a2e"; const bc = e.severity === "CRITICA" ? "#ef4444" : e.severity === "ALTA" ? "#f97316" : "#3b82f6"; return `<div style="background:${bg};border-left:4px solid ${bc};border-radius:10px;padding:14px 18px;margin-bottom:12px"><strong>${e.severity} — ${e.category}</strong><br><span style="font-size:0.9rem">${e.description}</span>${e.employees ? `<ul style="margin-top:6px;padding-left:16px;font-size:0.85rem">${e.employees.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}</div>`; }).join("");
  const top5Criticos = r.bioCross.filter((b) => b.status === "CRITICO").slice(0, 5).map((b) => `<li><strong>${b.employee}</strong> — planilla: ${b.otPlanilla} hrs vs reloj: ${b.otReloj.toFixed(1)} hrs (delta: +${b.delta.toFixed(1)} hrs, ${fmt(b.valorPlanilla)})</li>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoria Planilla Woden Peru — ${ml}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0}.header{background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:32px 40px;border-bottom:2px solid #f97316}.header h1{font-size:2rem;color:#f97316;margin-bottom:4px}.header p{color:#94a3b8;font-size:0.95rem}.container{max-width:1400px;margin:0 auto;padding:24px 40px}h2{font-size:1.3rem;color:#f97316;margin:32px 0 16px;border-left:4px solid #f97316;padding-left:12px}h3{font-size:1rem;color:#94a3b8;margin:20px 0 10px}p.intro{color:#94a3b8;font-size:0.875rem;margin-bottom:16px;line-height:1.6}.summary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px}.summary-item{background:#1e293b;border-radius:8px;padding:14px;text-align:center;border:1px solid #334155}.summary-item .val{font-size:1.6rem;font-weight:800;color:#f97316}.summary-item .lbl{font-size:0.75rem;color:#64748b;margin-top:4px}.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px}.kpi-card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}.kpi-label{color:#94a3b8;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}.kpi-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}.kpi-month{flex:1;text-align:center}.kpi-sub{display:block;font-size:0.7rem;color:#64748b;margin-bottom:2px}.kpi-val{font-size:1.1rem;font-weight:700;color:#f1f5f9}.kpi-delta{text-align:center;font-size:0.85rem;font-weight:600}.alert{border-radius:10px;padding:14px 18px;margin-bottom:12px;border-left:4px solid}.alert-red{background:#450a0a;border-color:#ef4444;color:#fca5a5}.alert-yellow{background:#422006;border-color:#f97316;color:#fdba74}.alert-green{background:#052e16;border-color:#22c55e;color:#86efac}.table-wrap{overflow-x:auto;border-radius:10px;border:1px solid #334155;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:0.875rem}thead tr{background:#1e3a5f}thead th{padding:10px 14px;text-align:left;color:#93c5fd;font-weight:600;white-space:nowrap}tbody tr{border-bottom:1px solid #1e293b;transition:background .15s}tbody tr:hover{background:#1e293b}tbody td{padding:8px 14px;color:#cbd5e1}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:600}.badge-red{background:#450a0a;color:#f87171}.badge-yellow{background:#422006;color:#fb923c}.badge-blue{background:#0c1a2e;color:#93c5fd}.bio-stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}.bio-stat-box{background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;text-align:center}.bio-stat-box .num{font-size:2rem;font-weight:800;margin-bottom:4px}.bio-stat-box .lbl{font-size:0.75rem;color:#64748b}.footer{text-align:center;padding:32px;color:#475569;font-size:0.8rem;border-top:1px solid #1e293b;margin-top:40px}</style></head><body>
<div class="header"><h1>Woden Peru — Auditoria de Planilla con Validacion Biometrica</h1><p>Comparativo <strong>${ml}</strong> vs <strong>${pl}</strong> | Generado el ${r.generatedAt}</p></div>
<div class="container">
<h2>Resumen Ejecutivo</h2>
<div class="summary-grid"><div class="summary-item"><div class="val">${r.activeCount}</div><div class="lbl">Empleados activos</div></div><div class="summary-item"><div class="val">${r.newHires.length}</div><div class="lbl">Nuevos ingresos</div></div><div class="summary-item"><div class="val">${r.terminations.length}</div><div class="lbl">Ceses / Bajas</div></div><div class="summary-item"><div class="val">${r.salaryChanges.length}</div><div class="lbl">Cambios salariales</div></div><div class="summary-item"><div class="val">${r.totalOTHrsCurr}</div><div class="lbl">Horas extras</div></div><div class="summary-item"><div class="val">${r.bioStats.critico}</div><div class="lbl">Criticos biometrico</div></div><div class="summary-item"><div class="val">${r.bioStats.revisar}</div><div class="lbl">Sin registro reloj</div></div><div class="summary-item"><div class="val">${fmt(r.montoEnRiesgo)}</div><div class="lbl">Monto HE en riesgo</div></div></div>
${r.exceptions.length > 0 ? `<h2>Reporte de Excepciones (${r.exceptions.length})</h2>${exceptionRows}` : ""}
${r.bioStats.critico > 0 ? `<div class="alert alert-red"><strong>${r.bioStats.critico} empleados CRITICOS en biometrico</strong><br><small>Monto total en riesgo: <strong>${fmt(r.montoEnRiesgo)}</strong></small><ul style="margin-top:8px;padding-left:16px;font-size:0.85rem">${top5Criticos}</ul></div>` : ""}
<h2>KPIs Financieros</h2>
<div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">Total Planilla (Neto)</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${fmt(r.totalNetPrev)}</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${fmt(r.totalNetCurr)}</span></div></div><div class="kpi-delta">${pct(r.totalNetCurr, r.totalNetPrev)}</div></div><div class="kpi-card"><div class="kpi-label">Horas Extras</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${fmt(r.totalOTValuePrev)}</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${fmt(r.totalOTValueCurr)}</span></div></div><div class="kpi-delta" style="color:${r.totalOTValueCurr > r.totalOTValuePrev ? "#ef4444" : "#22c55e"}">${pct(r.totalOTValueCurr, r.totalOTValuePrev)}</div></div><div class="kpi-card"><div class="kpi-label">Comisiones</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${fmt(r.totalCommPrev)}</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${fmt(r.totalCommCurr)}</span></div></div><div class="kpi-delta">${pct(r.totalCommCurr, r.totalCommPrev)}</div></div><div class="kpi-card"><div class="kpi-label">Bono Produccion</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${fmt(r.totalBonusProdPrev)}</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${fmt(r.totalBonusProdCurr)}</span></div></div><div class="kpi-delta">${pct(r.totalBonusProdCurr, r.totalBonusProdPrev)}</div></div><div class="kpi-card"><div class="kpi-label">Bono Movilidad</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${fmt(r.totalBonusMobPrev)}</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${fmt(r.totalBonusMobCurr)}</span></div></div><div class="kpi-delta">${pct(r.totalBonusMobCurr, r.totalBonusMobPrev)}</div></div><div class="kpi-card"><div class="kpi-label">Total HE (hrs)</div><div class="kpi-row"><div class="kpi-month"><span class="kpi-sub">${pl}</span><span class="kpi-val">${r.totalOTHrsPrev} hrs</span></div><div class="kpi-month"><span class="kpi-sub">${ml}</span><span class="kpi-val">${r.totalOTHrsCurr} hrs</span></div></div><div class="kpi-delta" style="color:${r.totalOTHrsCurr > r.totalOTHrsPrev ? "#ef4444" : "#22c55e"}">${pct(r.totalOTHrsCurr, r.totalOTHrsPrev)}</div></div></div>
<h2>Auditoria Biometrica</h2>
<div class="bio-stats-row"><div class="bio-stat-box"><div class="num" style="color:#ef4444">${r.bioStats.critico}</div><div class="lbl">CRITICO</div></div><div class="bio-stat-box"><div class="num" style="color:#f97316">${r.bioStats.alerta}</div><div class="lbl">ALERTA</div></div><div class="bio-stat-box"><div class="num" style="color:#22c55e">${r.bioStats.ok}</div><div class="lbl">OK</div></div><div class="bio-stat-box"><div class="num" style="color:#3b82f6">${r.bioStats.subpago}</div><div class="lbl">SUBPAGO</div></div><div class="bio-stat-box"><div class="num" style="color:#94a3b8">${r.bioStats.revisar}</div><div class="lbl">REVISAR</div></div></div>
${criticosRows ? `<h3 style="color:#ef4444">Empleados CRITICOS (${r.bioStats.critico})</h3><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>HE Reloj</th><th>HE Planilla</th><th>Delta</th><th>Valor</th><th>Estado</th></tr></thead><tbody>${criticosRows}</tbody></table></div>` : ""}
${alertaRows ? `<h3 style="color:#f97316">Empleados ALERTA (${r.bioStats.alerta})</h3><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>HE Reloj</th><th>HE Planilla</th><th>Delta</th><th>Valor</th><th>Estado</th></tr></thead><tbody>${alertaRows}</tbody></table></div>` : ""}
${noRelojRows ? `<h3>Sin registro en reloj (${r.bioNoReloj.length})</h3><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>HE Planilla</th><th>Valor</th></tr></thead><tbody>${noRelojRows}</tbody></table></div>` : ""}
${subpagoRows ? `<h3 style="color:#3b82f6">Empleados SUBPAGO (${r.bioCross.filter((b) => b.status === "SUBPAGO").length})</h3><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>HE Reloj</th><th>HE Planilla</th><th>Delta</th><th>Valor</th><th>Estado</th></tr></thead><tbody>${subpagoRows}</tbody></table></div>` : ""}
<h2>Horas Extras</h2>
<h3>Top 15</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Empleado</th><th>Area</th><th>HE (hrs)</th><th>Valor</th></tr></thead><tbody>${topOTRows}</tbody></table></div>
<h3>Variaciones significativas</h3><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>HE ${pl}</th><th>HE ${ml}</th><th>Delta</th><th>Val. ${pl}</th><th>Val. ${ml}</th><th>Delta Val.</th></tr></thead><tbody>${heVarRows}</tbody></table></div>
<h2>Bonos de Produccion</h2><div class="table-wrap"><table><thead><tr><th>Area</th><th>Empleados</th><th>${pl}</th><th>${ml}</th><th>Variacion</th></tr></thead><tbody>${bonusRows}</tbody></table></div>
<h2>Movimientos de Personal</h2>
<h3 style="color:#4ade80">Nuevos Ingresos (${r.newHires.length})</h3><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Area</th><th>Cargo</th><th>Sueldo</th></tr></thead><tbody>${newHireRows || `<tr><td colspan="4" style="text-align:center;padding:20px">Sin nuevos ingresos</td></tr>`}</tbody></table></div>
<h3 style="color:#ef4444">Ceses (${r.terminations.length})</h3><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Area</th><th>Cargo</th><th>Sueldo</th></tr></thead><tbody>${termRows || `<tr><td colspan="4" style="text-align:center;padding:20px">Sin ceses</td></tr>`}</tbody></table></div>
<h2>Cambios Salariales</h2><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Area</th><th>Basico ${pl}</th><th>Basico ${ml}</th><th>Delta Basico</th><th>Delta Bono</th></tr></thead><tbody>${salaryRows}</tbody></table></div>
</div><div class="footer">Reporte generado por SistemasWoden | ${pl} — ${ml}</div></body></html>`;
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export default function ValidacionPlanillaPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();

  const [tab, setTab] = useState<Tab>("upload");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [fileCurr, setFileCurr] = useState<File | null>(null);
  const [filePrev, setFilePrev] = useState<File | null>(null);
  const [fileBio, setFileBio] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ValidationReport | null>(null);

  /** Multi-month snapshots for trend analysis */
  const [snapshots, setSnapshots] = useState<MonthSnapshot[]>([]);

  const refCurr = useRef<HTMLInputElement>(null);
  const refPrev = useRef<HTMLInputElement>(null);
  const refBio = useRef<HTMLInputElement>(null);

  const [sheetPreview, setSheetPreview] = useState<{ name: string; headers: string[] }[]>([]);

  const handleProcess = useCallback(async () => {
    if (!fileCurr || !filePrev) { setError("Se requieren las planillas del mes actual y del mes anterior."); return; }
    setProcessing(true); setError(""); setSheetPreview([]);
    try {
      const [parsedCurr, parsedPrev] = await Promise.all([parseExcel(fileCurr), parseExcel(filePrev)]);
      const empCurr = parseEmployees(parsedCurr.sheets, parsedCurr.xlsxLib, parsedCurr.rawSheets);
      const empPrev = parseEmployees(parsedPrev.sheets, parsedPrev.xlsxLib, parsedPrev.rawSheets);
      if (empCurr.length === 0) {
        setError("No se detectaron empleados en la planilla actual. Columnas esperadas: APELLIDOS Y NOMBRES, AREA, BASICO, TOTAL HE, NETO. Se muestran las columnas encontradas abajo.");
        setSheetPreview(parsedCurr.sheets.map((s) => ({ name: s.name, headers: s.rows[0] ? Object.keys(s.rows[0]) : [] })));
        setProcessing(false); return;
      }
      let bioCurr: BiometricEntry[] = [];
      if (fileBio) { const parsedBio = await parseExcel(fileBio); bioCurr = parseBiometric(parsedBio.sheets); }
      const r = runValidation(empCurr, empPrev, bioCurr, year, month);
      setReport(r);

      // Add to snapshots (replace if same month/year already exists)
      setSnapshots((prev) => {
        const snap: MonthSnapshot = {
          label: `${r.month} ${r.year}`, monthIdx: r.monthIdx, year: r.year,
          activeCount: r.activeCount, newHires: r.newHires.length, terminations: r.terminations.length,
          totalNet: r.totalNetCurr, totalOTHrs: r.totalOTHrsCurr, totalOTValue: r.totalOTValueCurr,
          totalComm: r.totalCommCurr, totalBonusProd: r.totalBonusProdCurr, totalBonusMob: r.totalBonusMobCurr,
          bioStats: r.bioStats, montoEnRiesgo: r.montoEnRiesgo, otByArea: r.otByArea,
        };
        const existing = prev.filter((s) => !(s.monthIdx === snap.monthIdx && s.year === snap.year));
        return [...existing, snap].sort((a, b) => a.year * 12 + a.monthIdx - (b.year * 12 + b.monthIdx));
      });

      setTab("resumen");
    } catch (e) { setError(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    setProcessing(false);
  }, [fileCurr, filePrev, fileBio, year, month]);

  const handleExportHTML = useCallback(() => {
    if (!report) return;
    const html = generateHTML(report);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Woden_Peru_${MONTHS[month - 1]}${year}.html`; a.click();
    URL.revokeObjectURL(url);
  }, [report, year, month]);

  /* ── Chart data ── */
  const bioChartData = useMemo(() => {
    if (!report) return [];
    return [
      { name: "CRITICO", value: report.bioStats.critico, fill: PIE_COLORS.CRITICO },
      { name: "ALERTA", value: report.bioStats.alerta, fill: PIE_COLORS.ALERTA },
      { name: "OK", value: report.bioStats.ok, fill: PIE_COLORS.OK },
      { name: "SUBPAGO", value: report.bioStats.subpago, fill: PIE_COLORS.SUBPAGO },
      { name: "SIN RELOJ", value: report.bioStats.revisar, fill: PIE_COLORS["SIN RELOJ"] },
    ].filter((d) => d.value > 0);
  }, [report]);

  const criticosChartData = useMemo(() => {
    if (!report) return [];
    return report.bioCross.filter((b) => b.status === "CRITICO").slice(0, 10)
      .map((b) => ({ name: b.employee.split(" ").slice(0, 2).join(" "), reloj: b.otReloj, planilla: b.otPlanilla }));
  }, [report]);

  const otAreaChartData = useMemo(() => {
    if (!report) return [];
    return report.otByArea.slice(0, 8).map((o) => ({
      name: o.area.length > 20 ? o.area.slice(0, 18) + "..." : o.area,
      "Mes Anterior": o.hrsPrev, "Mes Actual": o.hrsCurr,
    }));
  }, [report]);

  const newHiresByArea = useMemo(() => {
    if (!report) return [];
    const map = new Map<string, number>();
    for (const h of report.newHires) map.set(h.area, (map.get(h.area) || 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [report]);

  const trendData = useMemo(() => snapshots, [snapshots]);

  /* ── Auth ── */
  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!authenticated || !hasAccess("/planilla/validacion")) return <div className="text-center py-12 text-gray-500">No autorizado</div>;

  const hasReport = !!report;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Validacion de Planilla</h1>
        <p className="text-sm text-gray-500 mt-1">Auditoria mensual con cruce biometrico, analisis de horas extras, comisiones, excepciones y tendencias.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              disabled={t.id !== "upload" && t.id !== "tendencias" && !hasReport}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-woden-primary text-woden-primary" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"} ${t.id !== "upload" && t.id !== "tendencias" && !hasReport ? "opacity-40 cursor-not-allowed" : ""}`}
            >{t.label}{t.id === "excepciones" && report && report.exceptions.length > 0 ? ` (${report.exceptions.length})` : ""}{t.id === "tendencias" && snapshots.length > 0 ? ` (${snapshots.length})` : ""}</button>
          ))}
        </nav>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}

      {/* ══════ UPLOAD ══════ */}
      {tab === "upload" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Periodo de Validacion</h2>
            <div className="flex gap-4 items-end">
              <div><label className="label-field">Ano</label><input type="number" className="input-field w-28" value={year} onChange={(e) => setYear(parseInt(e.target.value) || 2026)} /></div>
              <div><label className="label-field">Mes</label><select className="input-field w-40" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
            </div>
            {snapshots.length > 0 && <p className="text-xs text-gray-400 mt-3">{snapshots.length} mes(es) cargado(s) para tendencias: {snapshots.map((s) => s.label).join(", ")}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FileUploadCard label="Planilla Mes Actual *" desc={`${MONTHS[month - 1]} ${year}`} file={fileCurr} setFile={setFileCurr} ref_={refCurr} />
            <FileUploadCard label="Planilla Mes Anterior *" desc={month === 1 ? `Diciembre ${year - 1}` : `${MONTHS[month - 2]} ${year}`} file={filePrev} setFile={setFilePrev} ref_={refPrev} />
            <FileUploadCard label="Biometrico (Opcional)" desc="Reloj de presencia — HE por empleado" file={fileBio} setFile={setFileBio} ref_={refBio} />
          </div>

          <div className="flex gap-4">
            <button onClick={handleProcess} disabled={processing || !fileCurr || !filePrev} className="btn-primary text-lg px-8 py-3">
              {processing ? "Procesando..." : "Ejecutar Validacion"}
            </button>
            {hasReport && <button onClick={() => setTab("resumen")} className="btn-secondary px-8 py-3">Ver Ultimo Reporte</button>}
          </div>

          {sheetPreview.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Columnas detectadas en el archivo</h3>
              <p className="text-xs text-gray-500 mb-4">Se buscan: APELLIDOS Y NOMBRES, AREA, BASICO, TOTAL HE, NETO, etc.</p>
              {sheetPreview.map((sp) => (
                <div key={sp.name} className="mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">Hoja: {sp.name}</p>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-2">{sp.headers.map((h) => <span key={h} className="bg-gray-100 px-2 py-1 rounded">{h}</span>)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════ RESUMEN ══════ */}
      {tab === "resumen" && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            <KPIBox label="Empleados" value={report.activeCount} />
            <KPIBox label="Ingresos" value={report.newHires.length} color="text-green-600" />
            <KPIBox label="Ceses" value={report.terminations.length} color="text-red-600" />
            <KPIBox label="Cambios Sal." value={report.salaryChanges.length} />
            <KPIBox label="HE (hrs)" value={report.totalOTHrsCurr} />
            <KPIBox label="Criticos Bio" value={report.bioStats.critico} color="text-red-600" />
            <KPIBox label="Sin Reloj" value={report.bioStats.revisar} color="text-amber-600" />
            <KPIBox label="HE Riesgo" value={fmt(report.montoEnRiesgo)} isText color="text-red-600" />
          </div>

          {/* Alerts */}
          {report.exceptions.filter((e) => e.severity === "CRITICA").map((ex, i) => (
            <div key={i} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-sm">
              <p className="font-semibold text-red-800">{ex.category}: {ex.description}</p>
              {ex.employees && <ul className="text-sm text-red-700 mt-1 list-disc list-inside">{ex.employees.map((n, j) => <li key={j}>{n}</li>)}</ul>}
            </div>
          ))}
          {report.exceptions.filter((e) => e.severity === "ALTA").map((ex, i) => (
            <div key={i} className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-sm">
              <p className="font-semibold text-amber-800">{ex.category}: {ex.description}</p>
            </div>
          ))}

          {/* Financial KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FinancialCard label="Total Planilla (Neto)" prev={report.totalNetPrev} curr={report.totalNetCurr} prevLabel={report.prevMonth} currLabel={report.month} />
            <FinancialCard label="Horas Extras" prev={report.totalOTValuePrev} curr={report.totalOTValueCurr} prevLabel={report.prevMonth} currLabel={report.month} invertColor />
            <FinancialCard label="Comisiones" prev={report.totalCommPrev} curr={report.totalCommCurr} prevLabel={report.prevMonth} currLabel={report.month} />
            <FinancialCard label="Bono Produccion" prev={report.totalBonusProdPrev} curr={report.totalBonusProdCurr} prevLabel={report.prevMonth} currLabel={report.month} />
            <FinancialCard label="Bono Movilidad" prev={report.totalBonusMobPrev} curr={report.totalBonusMobCurr} prevLabel={report.prevMonth} currLabel={report.month} />
            <FinancialCard label="Total HE (hrs)" prev={report.totalOTHrsPrev} curr={report.totalOTHrsCurr} prevLabel={report.prevMonth} currLabel={report.month} invertColor isCurrency={false} suffix=" hrs" />
          </div>

          {/* OT by Area chart */}
          {otAreaChartData.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Horas Extras por Area — Comparativo</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={otAreaChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v} hrs`} />
                  <Legend />
                  <Bar dataKey="Mes Anterior" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Mes Actual" fill="#EA7704" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ══════ BIOMETRICO ══════ */}
      {tab === "biometrico" && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            <BioStatCard label="CRITICO" count={report.bioStats.critico} color="text-red-600" bg="bg-red-50" />
            <BioStatCard label="ALERTA" count={report.bioStats.alerta} color="text-amber-600" bg="bg-amber-50" />
            <BioStatCard label="OK" count={report.bioStats.ok} color="text-green-600" bg="bg-green-50" />
            <BioStatCard label="SUBPAGO" count={report.bioCross.filter((b) => b.status === "SUBPAGO").length} color="text-blue-600" bg="bg-blue-50" />
            <BioStatCard label="SIN RELOJ" count={report.bioStats.revisar} color="text-gray-600" bg="bg-gray-50" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bioChartData.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Distribucion Biometrica</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={bioChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                      {bioChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {criticosChartData.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Top CRITICOS — Reloj vs Planilla</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={criticosChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)} hrs`} />
                    <Legend />
                    <Bar dataKey="reloj" name="HE Reloj" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="planilla" name="HE Planilla" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {report.bioStats.critico > 0 && <div className="card overflow-x-auto"><h3 className="font-semibold text-red-700 mb-3">CRITICOS ({report.bioStats.critico}) — Monto en riesgo: {fmt(report.montoEnRiesgo)}</h3><BioTable entries={report.bioCross.filter((b) => b.status === "CRITICO")} /></div>}
          {report.bioStats.alerta > 0 && <div className="card overflow-x-auto"><h3 className="font-semibold text-amber-700 mb-3">ALERTA ({report.bioStats.alerta})</h3><BioTable entries={report.bioCross.filter((b) => b.status === "ALERTA")} /></div>}
          {report.bioNoReloj.length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-gray-700 mb-3">Sin registro en reloj ({report.bioNoReloj.length}) — {fmt(report.montoSinReloj)}</h3>
              <table className="w-full text-sm"><thead><tr><th className="table-header">Empleado</th><th className="table-header">Area</th><th className="table-header text-right">HE Planilla</th><th className="table-header text-right">Valor</th></tr></thead>
                <tbody>{report.bioNoReloj.map((b, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell">{b.employee}</td><td className="table-cell">{b.area}</td><td className="table-cell text-right">{b.otPlanilla.toFixed(1)}</td><td className="table-cell text-right">{fmt(b.valor)}</td></tr>)}</tbody></table>
            </div>
          )}
          {report.bioCross.filter((b) => b.status === "SUBPAGO").length > 0 && <div className="card overflow-x-auto"><h3 className="font-semibold text-blue-700 mb-3">SUBPAGO ({report.bioCross.filter((b) => b.status === "SUBPAGO").length})</h3><BioTable entries={report.bioCross.filter((b) => b.status === "SUBPAGO")} /></div>}
          {!fileBio && <div className="card text-center py-8"><p className="text-gray-500">No se cargo archivo biometrico. Vuelva a "Cargar Archivos" para incluirlo.</p></div>}
        </div>
      )}

      {/* ══════ HE ══════ */}
      {tab === "he" && report && (
        <div className="space-y-6">
          <div className="card"><p className="text-sm text-gray-600">{report.totalOTHrsCurr} horas extras ({fmt(report.totalOTValueCurr)}) vs {report.totalOTHrsPrev} hrs ({fmt(report.totalOTValuePrev)}) mes anterior. Variacion: <strong>{pct(report.totalOTHrsCurr, report.totalOTHrsPrev)}</strong>.</p></div>

          {otAreaChartData.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">HE por Area — {report.prevMonth} vs {report.month}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={otAreaChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v} hrs`} />
                  <Legend />
                  <Bar dataKey="Mes Anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Mes Actual" fill="#EA7704" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-900 mb-3">Top 15 — {report.month} {report.year}</h3>
            <table className="w-full text-sm"><thead><tr><th className="table-header">#</th><th className="table-header">Empleado</th><th className="table-header">Area</th><th className="table-header text-right">HE (hrs)</th><th className="table-header text-right">Valor</th></tr></thead>
              <tbody>{report.topOT.map((o, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell">{i + 1}</td><td className="table-cell font-medium">{o.employee}</td><td className="table-cell">{o.area}</td><td className="table-cell text-right font-bold">{o.hrs}</td><td className="table-cell text-right">{fmt(o.value)}</td></tr>)}</tbody></table>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-900 mb-3">Variaciones significativas (&gt;3 hrs)</h3>
            <table className="w-full text-sm"><thead><tr><th className="table-header">Empleado</th><th className="table-header">Area</th><th className="table-header text-right">HE {report.prevMonth}</th><th className="table-header text-right">HE {report.month}</th><th className="table-header text-right">Delta</th><th className="table-header text-right">Val. Ant.</th><th className="table-header text-right">Val. Act.</th><th className="table-header text-right">Delta Val.</th></tr></thead>
              <tbody>{report.heVariations.slice(0, 30).map((v, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{v.employee}</td><td className="table-cell">{v.area}</td><td className="table-cell text-right">{v.hePrev}</td><td className="table-cell text-right">{v.heCurr}</td><td className={`table-cell text-right font-bold ${v.deltaHrs > 0 ? "text-red-600" : "text-green-600"}`}>{v.deltaHrs > 0 ? "+" : ""}{v.deltaHrs}</td><td className="table-cell text-right text-gray-500">{fmt(v.valPrev)}</td><td className="table-cell text-right">{fmt(v.valCurr)}</td><td className={`table-cell text-right font-medium ${v.deltaVal > 0 ? "text-red-600" : "text-green-600"}`}>{v.deltaVal >= 0 ? "+" : ""}{fmt(v.deltaVal)}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}

      {/* ══════ COMISIONES ══════ */}
      {tab === "comisiones" && report && (
        <div className="space-y-6">
          {report.commByArea.length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-gray-900 mb-3">Comisiones por Area</h3>
              <table className="w-full text-sm"><thead><tr><th className="table-header">Area</th><th className="table-header text-right">{report.prevMonth}</th><th className="table-header text-right">{report.month}</th><th className="table-header text-right">Variacion</th></tr></thead>
                <tbody>{report.commByArea.map((c, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{c.area}</td><td className="table-cell text-right">{fmt(c.totalPrev)}</td><td className="table-cell text-right">{fmt(c.totalCurr)}</td><td className={`table-cell text-right font-medium ${c.delta >= 0 ? "text-green-600" : "text-red-600"}`}>{c.delta >= 0 ? "+" : ""}{fmt(c.delta)} ({pct(c.totalCurr, c.totalPrev)})</td></tr>)}</tbody></table>
            </div>
          )}
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-900 mb-3">Bonos de Produccion por Area</h3>
            <table className="w-full text-sm"><thead><tr><th className="table-header">Area</th><th className="table-header text-right">Empleados</th><th className="table-header text-right">{report.prevMonth}</th><th className="table-header text-right">{report.month}</th><th className="table-header text-right">Variacion</th></tr></thead>
              <tbody>{report.bonusByArea.map((b, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{b.area}</td><td className="table-cell text-right">{b.employees}</td><td className="table-cell text-right">{fmt(b.totalPrev)}</td><td className="table-cell text-right">{fmt(b.totalCurr)}</td><td className={`table-cell text-right font-medium ${b.delta >= 0 ? "text-green-600" : "text-red-600"}`}>{b.delta >= 0 ? "+" : ""}{fmt(b.delta)}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}

      {/* ══════ PERSONAL ══════ */}
      {tab === "personal" && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center"><p className="text-xs text-gray-500">Activos</p><p className="text-3xl font-bold text-gray-900">{report.activeCount}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500">Ingresos</p><p className="text-3xl font-bold text-green-600">{report.newHires.length}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500">Ceses</p><p className="text-3xl font-bold text-red-600">{report.terminations.length}</p></div>
          </div>

          {newHiresByArea.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Ingresos por Area</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={newHiresByArea} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {newHiresByArea.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-green-700 mb-3">Nuevos Ingresos ({report.newHires.length})</h3>
            {report.newHires.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">Sin ingresos.</p> :
              <table className="w-full text-sm"><thead><tr><th className="table-header">Nombre</th><th className="table-header">Area</th><th className="table-header">Cargo</th><th className="table-header text-right">Sueldo</th></tr></thead>
                <tbody>{report.newHires.map((h, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{h.name}</td><td className="table-cell">{h.area}</td><td className="table-cell">{h.cargo}</td><td className="table-cell text-right">{fmt(h.salary)}</td></tr>)}</tbody></table>}
          </div>
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-red-700 mb-3">Ceses ({report.terminations.length})</h3>
            {report.terminations.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">Sin ceses.</p> :
              <table className="w-full text-sm"><thead><tr><th className="table-header">Nombre</th><th className="table-header">Area</th><th className="table-header">Cargo</th><th className="table-header text-right">Sueldo</th></tr></thead>
                <tbody>{report.terminations.map((t, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{t.name}</td><td className="table-cell">{t.area}</td><td className="table-cell">{t.cargo}</td><td className="table-cell text-right">{fmt(t.salary)}</td></tr>)}</tbody></table>}
          </div>
        </div>
      )}

      {/* ══════ SALARIOS ══════ */}
      {tab === "salarios" && report && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-gray-900 mb-3">Cambios Salariales</h3>
          {report.salaryChanges.length === 0 ? <div className="text-center py-8"><p className="text-green-600 font-medium">Sin cambios salariales este mes</p></div> :
            <table className="w-full text-sm"><thead><tr><th className="table-header">Empleado</th><th className="table-header">Area</th><th className="table-header text-right">Basico Ant.</th><th className="table-header text-right">Basico Act.</th><th className="table-header text-right">Delta</th><th className="table-header text-right">Delta Bono</th></tr></thead>
              <tbody>{report.salaryChanges.map((s, i) => <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter"><td className="table-cell font-medium">{s.name}</td><td className="table-cell">{s.area}</td><td className="table-cell text-right">{fmt(s.prevSalary)}</td><td className="table-cell text-right">{fmt(s.currSalary)}</td><td className={`table-cell text-right font-medium ${s.deltaSalary >= 0 ? "text-green-600" : "text-red-600"}`}>{s.deltaSalary >= 0 ? "+" : ""}{fmt(s.deltaSalary)}</td><td className={`table-cell text-right font-medium ${s.deltaBonus >= 0 ? "text-green-600" : "text-red-600"}`}>{s.deltaBonus >= 0 ? "+" : ""}{fmt(s.deltaBonus)}</td></tr>)}</tbody></table>}
        </div>
      )}

      {/* ══════ EXCEPCIONES ══════ */}
      {tab === "excepciones" && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center bg-red-50"><p className="text-3xl font-bold text-red-600">{report.exceptions.filter((e) => e.severity === "CRITICA").length}</p><p className="text-xs text-gray-500 mt-1">CRITICAS</p></div>
            <div className="card text-center bg-amber-50"><p className="text-3xl font-bold text-amber-600">{report.exceptions.filter((e) => e.severity === "ALTA").length}</p><p className="text-xs text-gray-500 mt-1">ALTA</p></div>
            <div className="card text-center bg-blue-50"><p className="text-3xl font-bold text-blue-600">{report.exceptions.filter((e) => e.severity === "MEDIA").length}</p><p className="text-xs text-gray-500 mt-1">MEDIA</p></div>
          </div>

          {report.exceptions.length === 0 ? (
            <div className="card text-center py-8"><p className="text-green-600 font-medium">Sin excepciones detectadas este mes</p></div>
          ) : (
            report.exceptions.map((ex, i) => {
              const colors = { CRITICA: { bg: "bg-red-50", border: "border-red-500", text: "text-red-800", badge: "bg-red-100 text-red-700" }, ALTA: { bg: "bg-amber-50", border: "border-amber-500", text: "text-amber-800", badge: "bg-amber-100 text-amber-700" }, MEDIA: { bg: "bg-blue-50", border: "border-blue-500", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" } };
              const c = colors[ex.severity];
              return (
                <div key={i} className={`${c.bg} border-l-4 ${c.border} p-4 rounded-sm`}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>{ex.severity}</span>
                    <span className={`font-semibold ${c.text}`}>{ex.category}</span>
                    {ex.amount && <span className="text-sm text-gray-600 ml-auto">{fmt(ex.amount)}</span>}
                  </div>
                  <p className={`text-sm ${c.text}`}>{ex.description}</p>
                  {ex.employees && <ul className="text-sm text-gray-600 mt-2 list-disc list-inside">{ex.employees.map((n, j) => <li key={j}>{n}</li>)}</ul>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══════ TENDENCIAS ══════ */}
      {tab === "tendencias" && (
        <div className="space-y-6">
          {trendData.length < 2 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 text-lg mb-2">Se necesitan al menos 2 meses para mostrar tendencias</p>
              <p className="text-sm text-gray-400">Cargue planillas de diferentes meses en la pestana "Cargar Archivos". Cada mes que procese se acumula automaticamente para el analisis de tendencias.</p>
              <p className="text-sm text-gray-400 mt-2">Meses cargados: <strong>{trendData.length}</strong> — {trendData.map((s) => s.label).join(", ") || "ninguno"}</p>
            </div>
          ) : (
            <>
              <div className="card">
                <p className="text-sm text-gray-600">Tendencias basadas en {trendData.length} meses: {trendData.map((s) => s.label).join(", ")}.</p>
              </div>

              {/* Headcount trend */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Headcount — Activos, Ingresos, Ceses</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="activeCount" name="Activos" stroke="#EA7704" strokeWidth={3} dot={{ r: 5 }} />
                    <Line type="monotone" dataKey="newHires" name="Ingresos" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="terminations" name="Ceses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Financial trend */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Planilla Neta, HE Valor, Comisiones — Tendencia</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="totalNet" name="Neto Planilla" stroke="#EA7704" strokeWidth={3} dot={{ r: 5 }} />
                    <Line type="monotone" dataKey="totalOTValue" name="Valor HE" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="totalComm" name="Comisiones" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="totalBonusProd" name="Bono Prod." stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* OT hours trend */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Horas Extras (hrs) — Tendencia</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v} hrs`} />
                    <Bar dataKey="totalOTHrs" name="Total HE (hrs)" fill="#EA7704" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Biometric risk trend */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Riesgo Biometrico — Criticos y Monto en Riesgo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v.toFixed(0)}`} />
                    <Tooltip formatter={(v: number, name: string) => name.includes("Monto") ? fmt(v) : v} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey={(d: MonthSnapshot) => d.bioStats.critico} name="Criticos" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} />
                    <Line yAxisId="left" type="monotone" dataKey={(d: MonthSnapshot) => d.bioStats.alerta} name="Alertas" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="montoEnRiesgo" name="Monto Riesgo" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Summary table */}
              <div className="card overflow-x-auto">
                <h3 className="font-semibold text-gray-900 mb-3">Resumen Multi-Mes</h3>
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header">Mes</th><th className="table-header text-right">Activos</th><th className="table-header text-right">Ingresos</th><th className="table-header text-right">Ceses</th>
                    <th className="table-header text-right">Neto</th><th className="table-header text-right">HE Hrs</th><th className="table-header text-right">HE Valor</th>
                    <th className="table-header text-right">Criticos</th><th className="table-header text-right">Riesgo</th>
                  </tr></thead>
                  <tbody>{trendData.map((s, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter">
                      <td className="table-cell font-medium">{s.label}</td>
                      <td className="table-cell text-right">{s.activeCount}</td>
                      <td className="table-cell text-right text-green-600">{s.newHires}</td>
                      <td className="table-cell text-right text-red-600">{s.terminations}</td>
                      <td className="table-cell text-right">{fmt(s.totalNet)}</td>
                      <td className="table-cell text-right">{s.totalOTHrs}</td>
                      <td className="table-cell text-right">{fmt(s.totalOTValue)}</td>
                      <td className="table-cell text-right text-red-600 font-bold">{s.bioStats.critico}</td>
                      <td className="table-cell text-right text-red-600">{fmt(s.montoEnRiesgo)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════ EXPORTAR ══════ */}
      {tab === "exportar" && report && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Exportar Reporte</h3>
          <p className="text-sm text-gray-600 mb-6">Genera el reporte ejecutivo en HTML (tema oscuro). Incluye excepciones, KPIs, biometrico, HE, personal y salarios.</p>
          <button onClick={handleExportHTML} className="btn-primary px-8 py-3">Descargar HTML</button>
          <p className="text-xs text-gray-500 mt-4">Archivo: Woden_Peru_{MONTHS[month - 1]}{year}.html</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

function FileUploadCard({ label, desc, file, setFile, ref_ }: {
  label: string; desc: string; file: File | null; setFile: (f: File | null) => void; ref_: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-2">{label}</h3>
      <p className="text-xs text-gray-500 mb-4">{desc}</p>
      <input ref={ref_ as React.LegacyRef<HTMLInputElement>} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={() => ref_.current?.click()} className={`w-full py-8 border-2 border-dashed rounded-sm text-center transition-colors ${file ? "border-green-400 bg-green-50 text-green-700" : "border-gray-300 hover:border-woden-primary text-gray-400 hover:text-woden-primary"}`}>
        {file ? <div><div className="font-medium">{file.name}</div><div className="text-xs mt-1">{(file.size / 1024).toFixed(0)} KB</div></div>
          : <div><div className="text-3xl mb-2">+</div><div className="text-sm">Cargar archivo</div></div>}
      </button>
    </div>
  );
}

function KPIBox({ label, value, color, isText }: { label: string; value: number | string; color?: string; isText?: boolean }) {
  return (
    <div className="card text-center py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color || "text-gray-900"}`}>{isText ? value : typeof value === "number" ? value.toLocaleString("es-PE") : value}</p>
    </div>
  );
}

function FinancialCard({ label, prev, curr, prevLabel, currLabel, invertColor, isCurrency = true, suffix = "" }: {
  label: string; prev: number; curr: number; prevLabel: string; currLabel: string; invertColor?: boolean; isCurrency?: boolean; suffix?: string;
}) {
  const delta = curr - prev;
  const isUp = delta > 0;
  const color = invertColor ? (isUp ? "text-red-600" : "text-green-600") : (isUp ? "text-green-600" : "text-red-600");
  const format = (n: number) => isCurrency ? fmt(n) : `${n.toLocaleString("es-PE")}${suffix}`;
  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="flex justify-between items-end mb-2">
        <div><p className="text-xs text-gray-400">{prevLabel}</p><p className="text-lg font-semibold text-gray-700">{format(prev)}</p></div>
        <div className="text-right"><p className="text-xs text-gray-400">{currLabel}</p><p className="text-lg font-bold text-gray-900">{format(curr)}</p></div>
      </div>
      <p className={`text-sm font-semibold ${color}`}>{isUp ? "+" : ""}{format(delta)} ({pct(curr, prev)})</p>
    </div>
  );
}

function BioStatCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return <div className={`card text-center ${bg}`}><p className={`text-3xl font-bold ${color}`}>{count}</p><p className="text-xs text-gray-500 mt-1">{label}</p></div>;
}

function BioTable({ entries }: { entries: BioCrossResult[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="table-header">Empleado</th><th className="table-header">Area</th><th className="table-header text-right">HE Reloj</th><th className="table-header text-right">HE Planilla</th><th className="table-header text-right">Delta</th><th className="table-header text-right">Valor</th><th className="table-header">Estado</th></tr></thead>
      <tbody>{entries.map((b, i) => {
        const bc = b.status === "CRITICO" ? "bg-red-100 text-red-700" : b.status === "ALERTA" ? "bg-amber-100 text-amber-700" : b.status === "SUBPAGO" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700";
        return (
          <tr key={i} className="border-b border-gray-100 hover:bg-woden-primary-lighter">
            <td className="table-cell font-medium">{b.employee}</td><td className="table-cell">{b.area}</td>
            <td className="table-cell text-right">{b.otReloj.toFixed(1)}</td><td className="table-cell text-right">{b.otPlanilla.toFixed(1)}</td>
            <td className={`table-cell text-right font-bold ${b.delta > 0 ? "text-red-600" : "text-green-600"}`}>{b.delta > 0 ? "+" : ""}{b.delta.toFixed(1)}</td>
            <td className="table-cell text-right">{fmt(b.valorPlanilla)}</td>
            <td className="table-cell"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bc}`}>{b.status}</span></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}
