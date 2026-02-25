"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

interface Consumption {
  id: string;
  daysConsumed: number;
  requestId: string;
  dateFrom: string;
  dateTo: string;
  totalRequestDays: number;
  status: string;
  type: "TOMADA" | "EN_CURSO" | "PROGRAMADA" | "DINERO";
}

interface Accrual {
  accrualYear: number;
  totalDaysAccrued: number;
  totalDaysConsumed: number;
  remainingBalance: number;
  monthsAccrued: number;
  daysTaken: number;
  daysProgrammed: number;
  untrackedConsumed: number;
  effectiveBalance: number;
  consumptions: Consumption[];
}

interface PendingRequest {
  id: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  status: string;
}

interface EmployeeBalance {
  id: string;
  employeeCode: string;
  fullName: string;
  costCenter: string;
  accruals: Accrual[];
  pendingRequests: PendingRequest[];
  totalAvailable: number;
  totalEffective: number;
  totalProgrammed: number;
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

const STATUS_LABELS: Record<string, string> = {
  NIVEL_1_PENDIENTE: "Nivel 1",
  NIVEL_2_PENDIENTE: "Nivel 2",
  NIVEL_3_PENDIENTE: "Nivel 3",
  APROBADA: "Aprobada",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

  function getConsumptionTypeBadge(type: string): { label: string; className: string } {
    switch (type) {
      case "TOMADA":
        return { label: "Tomada", className: "bg-gray-100 text-gray-700" };
      case "EN_CURSO":
        return { label: "En curso", className: "bg-blue-100 text-blue-700" };
      case "PROGRAMADA":
        return { label: "Programada", className: "bg-amber-100 text-amber-700" };
      case "DINERO":
        return { label: "En dinero", className: "bg-green-100 text-green-700" };
      default:
        return { label: type, className: "bg-gray-100 text-gray-600" };
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Saldos de Vacaciones
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Extracto de vacaciones por periodo de devengamiento. El consumo
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

      {/* Balances — Statement View */}
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
                    {emp.totalEffective.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-400">días disponibles</p>
                  {emp.totalProgrammed > 0 && (
                    <p className="text-xs text-amber-600">
                      {emp.totalProgrammed.toFixed(1)} programados
                    </p>
                  )}
                </div>
              </button>

              {/* Expanded Statement View */}
              {expandedEmployee === emp.id && (
                <div className="border-t border-gray-100">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50">
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">
                        {emp.totalEffective.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500">Saldo Disponible</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-amber-600">
                        {emp.totalProgrammed.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500">Programadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-500">
                        {(emp.totalEffective - emp.totalProgrammed).toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500">Después de Programadas</p>
                    </div>
                  </div>

                  {/* Pending Requests */}
                  {emp.pendingRequests.length > 0 && (
                    <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                      <p className="text-xs font-semibold text-blue-700 mb-2">
                        Solicitudes en proceso de aprobación
                      </p>
                      {emp.pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex justify-between items-center text-sm text-blue-800 py-1"
                        >
                          <span>
                            {formatDate(req.dateFrom)} — {formatDate(req.dateTo)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600">
                              {STATUS_LABELS[req.status] || req.status}
                            </span>
                            <span className="font-medium">
                              {req.totalDays} días
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Accrual Periods — Statement */}
                  {emp.accruals.map((acc) => (
                    <div
                      key={acc.accrualYear}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      {/* Period Header */}
                      <div className="flex justify-between items-center px-4 py-3 bg-woden-primary-lighter">
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm font-bold ${getAgingColor(acc.accrualYear)}`}
                          >
                            Periodo {acc.accrualYear}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({acc.monthsAccrued}/12 meses)
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          Devengado: {acc.totalDaysAccrued.toFixed(1)} días
                        </span>
                      </div>

                      {/* Movements Table */}
                      {acc.consumptions.length > 0 || acc.untrackedConsumed > 0 ? (
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">
                                Concepto
                              </th>
                              <th className="text-center text-xs font-medium text-gray-400 px-2 py-2">
                                Estado
                              </th>
                              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2">
                                Días
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {acc.untrackedConsumed > 0 && (
                              <tr className="border-t border-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-500 italic">
                                  Vacaciones tomadas (carga inicial)
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                    Histórico
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-medium text-red-600">
                                  -{acc.untrackedConsumed.toFixed(1)}
                                </td>
                              </tr>
                            )}
                            {acc.consumptions.map((c) => {
                              const badge = getConsumptionTypeBadge(c.type);
                              return (
                                <tr
                                  key={c.id}
                                  className={`border-t border-gray-50 ${
                                    c.type === "PROGRAMADA" ? "bg-amber-50/50" : ""
                                  }`}
                                >
                                  <td className="px-4 py-2 text-sm text-gray-700">
                                    {c.type === "DINERO" ? (
                                      <>
                                        Pago en dinero — {formatDate(c.dateFrom)}
                                      </>
                                    ) : (
                                      <>
                                        {formatDate(c.dateFrom)} — {formatDate(c.dateTo)}
                                        {c.totalRequestDays !== c.daysConsumed && (
                                          <span className="text-xs text-gray-400 ml-1">
                                            ({c.daysConsumed.toFixed(1)} de {c.totalRequestDays} días FIFO)
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td
                                    className={`px-4 py-2 text-sm text-right font-medium ${
                                      c.type === "PROGRAMADA"
                                        ? "text-amber-600"
                                        : c.type === "DINERO"
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    -{c.daysConsumed.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p className="px-4 py-3 text-xs text-gray-400 italic">
                          Sin movimientos registrados
                        </p>
                      )}

                      {/* Period Summary */}
                      <div className="px-4 py-3 bg-gray-50 flex justify-between text-sm">
                        <div className="flex gap-6">
                          {acc.daysTaken > 0 && (
                            <span className="text-gray-600">
                              Tomadas:{" "}
                              <span className="font-medium text-red-600">
                                {acc.daysTaken.toFixed(1)}
                              </span>
                            </span>
                          )}
                          {acc.daysProgrammed > 0 && (
                            <span className="text-gray-600">
                              Programadas:{" "}
                              <span className="font-medium text-amber-600">
                                {acc.daysProgrammed.toFixed(1)}
                              </span>
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-bold ${getAgingColor(acc.accrualYear)}`}
                        >
                          Saldo: {acc.effectiveBalance.toFixed(1)} días
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Aging Legend */}
                  <div className="px-4 py-3 flex gap-4 text-xs border-t border-gray-100">
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
