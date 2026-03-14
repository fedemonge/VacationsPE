"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: number;
  scheduledHours: number;
  overtimeHours: number;
  tardinessMinutes: number;
  isAbsent: boolean;
  isHoliday: boolean;
  source: string;
}

interface AttendanceSummary {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  daysWorked: number;
  daysAbsent: number;
  ot25: number;
  ot35: number;
  ot100: number;
  tardinessMin: number;
  totalOvertimeHours: number;
  recordCount: number;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  unmatchedNames: string[];
  graceMinutesUsed: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type Tab = "importar" | "registros" | "resumen";

export default function AsistenciaPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();

  const [tab, setTab] = useState<Tab>("importar");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  // Import state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Records state
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Summary state
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams({
        periodYear: String(filterYear),
        periodMonth: String(filterMonth),
      });
      const res = await fetch(`/api/planilla/asistencia?${params}`);
      if (res.ok) setRecords(await res.json());
    } catch {
      // silent
    }
    setLoadingRecords(false);
  }, [filterYear, filterMonth]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const params = new URLSearchParams({
        periodYear: String(filterYear),
        periodMonth: String(filterMonth),
      });
      const res = await fetch(`/api/planilla/asistencia/resumen?${params}`);
      if (res.ok) setSummaries(await res.json());
    } catch {
      // silent
    }
    setLoadingSummary(false);
  }, [filterYear, filterMonth]);

  useEffect(() => {
    if (!authenticated || !hasAccess("/planilla/asistencia")) return;
    if (tab === "registros") loadRecords();
    if (tab === "resumen") loadSummary();
  }, [authenticated, hasAccess, tab, loadRecords, loadSummary]);

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla/asistencia")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setImportResult(null);
    setImporting(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("periodYear", String(filterYear));
    formData.append("periodMonth", String(filterMonth));

    try {
      const res = await fetch("/api/planilla/asistencia/importar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        setSuccess(`Importación completada: ${data.imported} registros`);
      } else {
        setError(data.error || "Error en importación");
      }
    } catch {
      setError("Error de conexión");
    }
    setImporting(false);
    e.target.value = "";
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-woden-primary text-woden-primary"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Asistencia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Importar asistencia biométrica y revisar cálculos de horas extra / tardanzas
        </p>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">{error}</div>}
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">{success}</div>}

      {/* Period Selector */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="label-field">Año</label>
            <input
              type="number"
              className="input-field w-28"
              value={filterYear}
              onChange={(e) => setFilterYear(parseInt(e.target.value) || new Date().getFullYear())}
            />
          </div>
          <div>
            <label className="label-field">Mes</label>
            <select className="input-field w-40" value={filterMonth} onChange={(e) => setFilterMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <span className="text-lg font-semibold text-gray-700">
            {MONTHS[filterMonth - 1]} {filterYear}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        <button className={tabClass("importar")} onClick={() => setTab("importar")}>Importar</button>
        <button className={tabClass("registros")} onClick={() => setTab("registros")}>Registros</button>
        <button className={tabClass("resumen")} onClick={() => setTab("resumen")}>Resumen</button>
      </div>

      {/* ── Tab: Importar ───────────────────────────────── */}
      {tab === "importar" && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Importar Reporte Biométrico</h2>
          <p className="text-sm text-gray-500 mb-4">
            Suba el archivo del reloj biométrico (CSV, TXT o XLSX). Columnas esperadas: Empleado, Entrada, Salida, Horas trabajadas
          </p>

          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleImport}
              disabled={importing}
              className="text-sm"
            />
            {importing && <span className="text-sm text-gray-500">Procesando...</span>}
          </div>

          {importResult && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-green-50 rounded-sm text-center">
                  <p className="text-xs text-green-600">Importados</p>
                  <p className="text-xl font-bold text-green-700">{importResult.imported}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-sm text-center">
                  <p className="text-xs text-amber-600">Omitidos</p>
                  <p className="text-xl font-bold text-amber-700">{importResult.skipped}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-sm text-center">
                  <p className="text-xs text-red-600">Errores</p>
                  <p className="text-xl font-bold text-red-700">{importResult.errors.length}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-sm text-center">
                  <p className="text-xs text-blue-600">Tolerancia</p>
                  <p className="text-xl font-bold text-blue-700">{importResult.graceMinutesUsed} min</p>
                </div>
              </div>

              {importResult.unmatchedNames.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    Nombres no encontrados ({importResult.unmatchedNames.length}):
                  </p>
                  <ul className="text-xs text-amber-700 list-disc pl-4">
                    {importResult.unmatchedNames.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-sm max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-red-800 mb-1">Errores:</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Registros ──────────────────────────────── */}
      {tab === "registros" && (
        <div className="card overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Registros de Asistencia — {MONTHS[filterMonth - 1]} {filterYear}
            </h2>
            <button onClick={loadRecords} className="btn-primary text-sm">Actualizar</button>
          </div>
          {loadingRecords ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No hay registros para este periodo. Importe un reporte biométrico.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Empleado</th>
                  <th className="table-header">Entrada</th>
                  <th className="table-header">Salida</th>
                  <th className="table-header text-right">Horas</th>
                  <th className="table-header text-right">HE</th>
                  <th className="table-header text-right">Tardanza</th>
                  <th className="table-header">Estado</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const hasTardiness = r.tardinessMinutes > 0;
                  const hasOT = r.overtimeHours > 0;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-100 ${
                        r.isAbsent ? "bg-red-50" : hasTardiness ? "bg-amber-50" : hasOT ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="table-cell font-medium">
                        {new Date(r.date).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}
                      </td>
                      <td className="table-cell">
                        <div>{r.employeeName}</div>
                        <div className="text-xs text-gray-400">{r.employeeCode}</div>
                      </td>
                      <td className="table-cell text-xs">
                        {r.clockIn ? new Date(r.clockIn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="table-cell text-xs">
                        {r.clockOut ? new Date(r.clockOut).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="table-cell text-right">{r.hoursWorked.toFixed(2)}</td>
                      <td className={`table-cell text-right ${hasOT ? "text-blue-700 font-medium" : "text-gray-400"}`}>
                        {r.overtimeHours > 0 ? r.overtimeHours.toFixed(2) : "-"}
                      </td>
                      <td className={`table-cell text-right ${hasTardiness ? "text-amber-700 font-medium" : "text-gray-400"}`}>
                        {r.tardinessMinutes > 0 ? `${r.tardinessMinutes} min` : "-"}
                      </td>
                      <td className="table-cell">
                        {r.isAbsent ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-sm text-xs">Ausente</span>
                        ) : r.isHoliday ? (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-sm text-xs">Feriado</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-sm text-xs">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Resumen ────────────────────────────────── */}
      {tab === "resumen" && (
        <div className="card overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Resumen — {MONTHS[filterMonth - 1]} {filterYear}
            </h2>
            <button onClick={loadSummary} className="btn-primary text-sm">Actualizar</button>
          </div>
          {loadingSummary ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No hay datos de asistencia para este periodo.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Empleado</th>
                    <th className="table-header text-right">Días Trab.</th>
                    <th className="table-header text-right">Ausencias</th>
                    <th className="table-header text-right">HE 25%</th>
                    <th className="table-header text-right">HE 35%</th>
                    <th className="table-header text-right">HE 100%</th>
                    <th className="table-header text-right">Tardanza (min)</th>
                    <th className="table-header">Usar en Cálculo</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.employeeId} className="border-b border-gray-100 hover:bg-woden-primary-lighter">
                      <td className="table-cell">
                        <div className="font-medium">{s.employeeName}</div>
                        <div className="text-xs text-gray-400">{s.employeeCode}</div>
                      </td>
                      <td className="table-cell text-right">{s.daysWorked}</td>
                      <td className={`table-cell text-right ${s.daysAbsent > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        {s.daysAbsent || "-"}
                      </td>
                      <td className={`table-cell text-right ${s.ot25 > 0 ? "text-blue-700" : "text-gray-400"}`}>
                        {s.ot25 > 0 ? s.ot25.toFixed(2) : "-"}
                      </td>
                      <td className={`table-cell text-right ${s.ot35 > 0 ? "text-blue-700" : "text-gray-400"}`}>
                        {s.ot35 > 0 ? s.ot35.toFixed(2) : "-"}
                      </td>
                      <td className={`table-cell text-right ${s.ot100 > 0 ? "text-blue-700 font-medium" : "text-gray-400"}`}>
                        {s.ot100 > 0 ? s.ot100.toFixed(2) : "-"}
                      </td>
                      <td className={`table-cell text-right ${s.tardinessMin > 0 ? "text-amber-700" : "text-gray-400"}`}>
                        {s.tardinessMin > 0 ? s.tardinessMin : "-"}
                      </td>
                      <td className="table-cell">
                        <Link
                          href={`/planilla/calcular?employeeId=${s.employeeId}&fromAttendance=1&year=${filterYear}&month=${filterMonth}`}
                          className="text-woden-primary hover:underline text-xs"
                        >
                          Calcular
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary totals */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 rounded-sm text-center">
                  <p className="text-xs text-gray-500">Empleados</p>
                  <p className="text-lg font-bold text-gray-900">{summaries.length}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-sm text-center">
                  <p className="text-xs text-blue-600">Total HE</p>
                  <p className="text-lg font-bold text-blue-700">
                    {summaries.reduce((s, r) => s + r.totalOvertimeHours, 0).toFixed(2)} hrs
                  </p>
                </div>
                <div className="p-3 bg-red-50 rounded-sm text-center">
                  <p className="text-xs text-red-600">Total Ausencias</p>
                  <p className="text-lg font-bold text-red-700">
                    {summaries.reduce((s, r) => s + r.daysAbsent, 0)} días
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-sm text-center">
                  <p className="text-xs text-amber-600">Total Tardanzas</p>
                  <p className="text-lg font-bold text-amber-700">
                    {summaries.reduce((s, r) => s + r.tardinessMin, 0)} min
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
