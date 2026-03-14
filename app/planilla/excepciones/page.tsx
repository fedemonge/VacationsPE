"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

interface ExceptionLog {
  id: string;
  detailLineId: string;
  periodId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  conceptCode: string;
  conceptName: string;
  autoAmount: number;
  adjustedAmount: number;
  adjustedBy: string;
  adjustedAt: string;
  reason: string | null;
  periodLabel: string;
  difference: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function ExcepcionesPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();

  const [logs, setLogs] = useState<ExceptionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("periodYear", String(filterYear));
      if (filterMonth > 0) params.set("periodMonth", String(filterMonth));

      const res = await fetch(`/api/planilla/excepciones?${params.toString()}`);
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [filterYear, filterMonth]);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla/excepciones")) {
      loadLogs();
    }
  }, [authenticated, hasAccess, loadLogs]);

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla/excepciones")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  const totalDifference = logs.reduce((s, l) => s + l.difference, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reporte de Excepciones</h1>
        <p className="text-sm text-gray-500 mt-1">
          Registro de todos los ajustes manuales realizados sobre cálculos automáticos de planilla.
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="label-field">Año</label>
            <input
              type="number"
              className="input-field w-28"
              value={filterYear}
              onChange={(e) => setFilterYear(parseInt(e.target.value) || 2026)}
            />
          </div>
          <div>
            <label className="label-field">Mes</label>
            <select
              className="input-field w-40"
              value={filterMonth}
              onChange={(e) => setFilterMonth(parseInt(e.target.value))}
            >
              <option value={0}>Todos</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <button onClick={loadLogs} className="btn-primary">
            Filtrar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Excepciones</p>
          <p className="text-2xl font-bold text-amber-600">{logs.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Empleados Afectados</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(logs.map((l) => l.employeeId)).size}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Diferencia Total</p>
          <p className={`text-2xl font-bold ${totalDifference >= 0 ? "text-green-600" : "text-red-600"}`}>
            {totalDifference >= 0 ? "+" : ""}S/ {totalDifference.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No hay excepciones registradas para el periodo seleccionado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Periodo</th>
                <th className="table-header">Empleado</th>
                <th className="table-header">Concepto</th>
                <th className="table-header text-right">Monto Auto</th>
                <th className="table-header text-right">Monto Ajustado</th>
                <th className="table-header text-right">Diferencia</th>
                <th className="table-header">Ajustado Por</th>
                <th className="table-header">Razón</th>
                <th className="table-header">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-woden-primary-lighter">
                  <td className="table-cell font-medium">{log.periodLabel}</td>
                  <td className="table-cell">
                    <div>{log.employeeName}</div>
                    <div className="text-xs text-gray-400">{log.employeeCode}</div>
                  </td>
                  <td className="table-cell">
                    <div>{log.conceptName}</div>
                    <div className="text-xs text-gray-400">{log.conceptCode}</div>
                  </td>
                  <td className="table-cell text-right text-gray-500">
                    S/ {log.autoAmount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="table-cell text-right font-medium text-amber-700">
                    S/ {log.adjustedAmount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`table-cell text-right font-medium ${log.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {log.difference >= 0 ? "+" : ""}S/ {log.difference.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="table-cell text-gray-600">{log.adjustedBy}</td>
                  <td className="table-cell text-gray-600 max-w-[200px] truncate" title={log.reason || ""}>
                    {log.reason || "-"}
                  </td>
                  <td className="table-cell text-gray-500 text-xs">
                    {new Date(log.adjustedAt).toLocaleString("es-PE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
