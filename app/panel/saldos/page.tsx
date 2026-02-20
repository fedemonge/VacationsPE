"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

interface Accrual {
  accrualYear: number;
  totalDaysAccrued: number;
  totalDaysConsumed: number;
  remainingBalance: number;
  monthsAccrued: number;
}

interface EmployeeBalance {
  id: string;
  employeeCode: string;
  fullName: string;
  costCenter: string;
  accruals: Accrual[];
  totalAvailable: number;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
}

interface Adjustment {
  id: string;
  accrualYear: number;
  adjustmentType: string;
  previousValue: number;
  newValue: number;
  daysDelta: number;
  reason: string;
  adjustedBy: string;
  createdAt: string;
  employee: { fullName: string; employeeCode: string };
}

export default function SaldosPage() {
  const { role } = useAuth();
  const canAdjust = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"].includes(role);

  const [balances, setBalances] = useState<EmployeeBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCostCenter, setFilterCostCenter] = useState("");
  const [costCenters, setCostCenters] = useState<string[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Adjustment form state
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adjEmployeeId, setAdjEmployeeId] = useState("");
  const [adjYear, setAdjYear] = useState("");
  const [adjDays, setAdjDays] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjType, setAdjType] = useState("CARGA_INICIAL");
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjMessage, setAdjMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Adjustment history
  const [showHistory, setShowHistory] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadBalances();
    if (canAdjust) {
      fetch("/api/empleados")
        .then((r) => r.json())
        .then((data) => setEmployees(data.employees || []))
        .catch(() => {});
    }
  }, [canAdjust]);

  function loadBalances() {
    setLoading(true);
    fetch("/api/saldos")
      .then((r) => r.json())
      .then((data) => {
        setBalances(data.balances || []);
        const ccs = Array.from(
          new Set<string>(
            (data.balances || []).map((b: EmployeeBalance) => b.costCenter)
          )
        );
        setCostCenters(ccs.sort());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/saldos/ajustar");
      const data = await res.json();
      setAdjustments(data.adjustments || []);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjLoading(true);
    setAdjMessage(null);

    try {
      const res = await fetch("/api/saldos/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: adjEmployeeId,
          accrualYear: parseInt(adjYear),
          newAccruedDays: parseFloat(adjDays),
          reason: adjReason,
          adjustmentType: adjType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAdjMessage({ type: "error", text: data.error });
      } else {
        setAdjMessage({
          type: "success",
          text: `Ajuste registrado: ${data.adjustment.previousValue} → ${data.adjustment.newValue} días (${data.adjustment.daysDelta > 0 ? "+" : ""}${data.adjustment.daysDelta} días)`,
        });
        setAdjEmployeeId("");
        setAdjYear("");
        setAdjDays("");
        setAdjReason("");
        loadBalances();
        if (showHistory) loadHistory();
      }
    } catch {
      setAdjMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setAdjLoading(false);
    }
  }

  const filtered = filterCostCenter
    ? balances.filter((b) => b.costCenter === filterCostCenter)
    : balances;

  function getAgingColor(year: number): string {
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age >= 2) return "text-red-600 font-bold";
    if (age === 1) return "text-yellow-600";
    return "text-green-600";
  }

  const TYPE_LABELS: Record<string, string> = {
    CARGA_INICIAL: "Carga Inicial",
    AJUSTE_MANUAL: "Ajuste Manual",
    CORRECCION: "Corrección",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Saldos de Vacaciones
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Control de saldo desglosado por periodo de devengamiento. El consumo
        sigue lógica FIFO (primero en entrar, primero en salir).
      </p>

      {/* Action buttons for admin roles */}
      {canAdjust && (
        <div className="flex gap-3 mb-6">
          <button
            className={`px-4 py-2 text-sm rounded-sm border transition-colors ${
              showAdjustForm
                ? "bg-woden-primary text-white border-woden-primary"
                : "border-woden-primary text-woden-primary hover:bg-woden-primary-lighter"
            }`}
            onClick={() => {
              setShowAdjustForm(!showAdjustForm);
              setAdjMessage(null);
            }}
          >
            {showAdjustForm ? "Cerrar Formulario" : "Cargar / Ajustar Saldo"}
          </button>
          <button
            className={`px-4 py-2 text-sm rounded-sm border transition-colors ${
              showHistory
                ? "bg-gray-700 text-white border-gray-700"
                : "border-gray-300 text-gray-600 hover:border-gray-500"
            }`}
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadHistory();
            }}
          >
            {showHistory ? "Cerrar Historial" : "Historial de Ajustes"}
          </button>
        </div>
      )}

      {/* Adjustment Form */}
      {showAdjustForm && canAdjust && (
        <div className="card mb-6 border-l-4 border-l-woden-primary">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Cargar / Ajustar Saldo de Vacaciones
          </h2>

          {adjMessage && (
            <div
              className={`mb-4 p-3 rounded-sm text-sm ${
                adjMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {adjMessage.text}
            </div>
          )}

          <form onSubmit={handleAdjustment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-field">Empleado</label>
                <select
                  className="input-field"
                  value={adjEmployeeId}
                  onChange={(e) => setAdjEmployeeId(e.target.value)}
                  required
                >
                  <option value="">Seleccione un empleado...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employeeCode} - {emp.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Periodo (Año)</label>
                <input
                  type="number"
                  className="input-field"
                  value={adjYear}
                  onChange={(e) => setAdjYear(e.target.value)}
                  placeholder="Ej: 2025"
                  min={2000}
                  max={2100}
                  required
                />
              </div>
              <div>
                <label className="label-field">Días Devengados (nuevo valor)</label>
                <input
                  type="number"
                  className="input-field"
                  value={adjDays}
                  onChange={(e) => setAdjDays(e.target.value)}
                  placeholder="Ej: 30"
                  min={0}
                  max={60}
                  step={0.5}
                  required
                />
              </div>
              <div>
                <label className="label-field">Tipo de Ajuste</label>
                <select
                  className="input-field"
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                >
                  <option value="CARGA_INICIAL">Carga Inicial</option>
                  <option value="AJUSTE_MANUAL">Ajuste Manual</option>
                  <option value="CORRECCION">Corrección</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label-field">
                Motivo del Ajuste (mínimo 10 caracteres)
              </label>
              <textarea
                className="input-field"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Describa el motivo del ajuste de saldo..."
                rows={2}
                required
                minLength={10}
              />
              <p className="text-xs text-gray-400 mt-1">
                {adjReason.length} / 10 caracteres mínimos
              </p>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={
                adjLoading ||
                !adjEmployeeId ||
                !adjYear ||
                !adjDays ||
                adjReason.length < 10
              }
            >
              {adjLoading ? "Registrando..." : "Registrar Ajuste"}
            </button>
          </form>
        </div>
      )}

      {/* Adjustment History */}
      {showHistory && canAdjust && (
        <div className="card mb-6 p-0">
          <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-100">
            Historial de Ajustes de Saldo
          </h2>
          {historyLoading ? (
            <div className="p-4 text-center text-gray-400">Cargando...</div>
          ) : adjustments.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              No hay ajustes registrados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">Empleado</th>
                    <th className="table-header">Periodo</th>
                    <th className="table-header">Tipo</th>
                    <th className="table-header">Anterior</th>
                    <th className="table-header">Nuevo</th>
                    <th className="table-header">Delta</th>
                    <th className="table-header">Motivo</th>
                    <th className="table-header">Realizado por</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-woden-primary-lighter">
                      <td className="table-cell text-xs">
                        {new Date(adj.createdAt).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="table-cell text-sm">
                        {adj.employee.employeeCode} - {adj.employee.fullName}
                      </td>
                      <td className="table-cell text-sm">{adj.accrualYear}</td>
                      <td className="table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-woden-primary-light text-woden-primary">
                          {TYPE_LABELS[adj.adjustmentType] ||
                            adj.adjustmentType}
                        </span>
                      </td>
                      <td className="table-cell text-sm text-right">
                        {adj.previousValue.toFixed(1)}
                      </td>
                      <td className="table-cell text-sm text-right font-medium">
                        {adj.newValue.toFixed(1)}
                      </td>
                      <td
                        className={`table-cell text-sm text-right font-medium ${
                          adj.daysDelta > 0
                            ? "text-green-600"
                            : adj.daysDelta < 0
                              ? "text-red-600"
                              : "text-gray-400"
                        }`}
                      >
                        {adj.daysDelta > 0 ? "+" : ""}
                        {adj.daysDelta.toFixed(1)}
                      </td>
                      <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">
                        {adj.reason}
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {adj.adjustedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <span className="text-sm text-gray-500">Centro de Costos:</span>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            !filterCostCenter
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterCostCenter("")}
        >
          Todos
        </button>
        {costCenters.map((cc) => (
          <button
            key={cc}
            className={`px-3 py-1 text-sm rounded-sm border ${
              filterCostCenter === cc
                ? "bg-woden-primary text-white border-woden-primary"
                : "border-gray-300 text-gray-600 hover:border-woden-primary"
            }`}
            onClick={() => setFilterCostCenter(cc)}
          >
            {cc}
          </button>
        ))}
      </div>

      {/* Balances Table */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center text-gray-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="card text-center text-gray-400">
            No hay datos de saldos
          </div>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id} className="card p-0">
              {/* Employee Header */}
              <button
                className="w-full flex justify-between items-center p-4 hover:bg-woden-primary-lighter transition-colors text-left"
                onClick={() =>
                  setExpandedEmployee(
                    expandedEmployee === emp.id ? null : emp.id
                  )
                }
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {emp.fullName}{" "}
                    <span className="text-gray-400 text-xs">
                      ({emp.employeeCode})
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">{emp.costCenter}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-woden-primary">
                    {emp.totalAvailable.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-400">días disponibles</p>
                </div>
              </button>

              {/* Expanded Accrual Details */}
              {expandedEmployee === emp.id && (
                <div className="border-t border-gray-100 p-4">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 pb-2">
                          Periodo
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Meses
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Devengado
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Consumido
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Saldo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.accruals.map((acc) => (
                        <tr
                          key={acc.accrualYear}
                          className="border-t border-gray-50"
                        >
                          <td
                            className={`py-2 text-sm ${getAgingColor(acc.accrualYear)}`}
                          >
                            {acc.accrualYear}
                          </td>
                          <td className="py-2 text-sm text-right text-gray-500">
                            {acc.monthsAccrued}/12
                          </td>
                          <td className="py-2 text-sm text-right">
                            {acc.totalDaysAccrued.toFixed(1)}
                          </td>
                          <td className="py-2 text-sm text-right text-gray-500">
                            {acc.totalDaysConsumed.toFixed(1)}
                          </td>
                          <td
                            className={`py-2 text-sm text-right font-medium ${getAgingColor(acc.accrualYear)}`}
                          >
                            {acc.remainingBalance.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Aging Legend */}
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-red-600">● +2 años (crítico)</span>
                    <span className="text-yellow-600">● 1 año (atención)</span>
                    <span className="text-green-600">● Año actual</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
