"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface FecArea {
  id: string;
  name: string;
}

interface FecCompany {
  id: string;
  name: string;
  code: string;
  currency: string;
}

interface FecIdea {
  id: string;
  code: string;
  title: string;
  description: string;
  ideaType: "AHORRO" | "USO";
  status: string;
  areaId: string;
  area: { id: string; name: string };
  companyId: string;
  company: { id: string; name: string; code: string; currency: string };
  projectCurrency: string;
  leadEmployee: { id: string; fullName: string; email: string };
  implementationDate: string | null;
  revisedImplementationDate: string | null;
  annualizedValue: number;
  effectiveValue: number;
  annualizedValueUsd: number;
  effectiveValueUsd: number;
  analystApprovalRequired: boolean;
  analystApprovedBy: string | null;
  createdAt: string;
}

const CURRENCIES = ["PEN", "COP", "BRL", "USD", "EUR", "MXN", "CRC"];

const MONTH_LABELS = [
  "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6",
  "Mes 7", "Mes 8", "Mes 9", "Mes 10", "Mes 11", "Mes 12",
];

const STATUS_COLUMNS = [
  { key: "ESTUDIAR", label: "Estudiar", color: "bg-blue-500" },
  { key: "FIRME", label: "Firme", color: "bg-yellow-500" },
  { key: "IMPLEMENTADA", label: "Implementada", color: "bg-green-500" },
  { key: "SUSPENDIDA", label: "Suspendida", color: "bg-orange-500" },
  { key: "CANCELADA", label: "Cancelada", color: "bg-red-500" },
];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  ESTUDIAR: ["FIRME", "CANCELADA", "SUSPENDIDA"],
  FIRME: ["ESTUDIAR", "IMPLEMENTADA", "CANCELADA", "SUSPENDIDA"],
  IMPLEMENTADA: ["FIRME", "CANCELADA"],
  SUSPENDIDA: ["ESTUDIAR", "FIRME"],
  CANCELADA: [],
};

function formatCurrency(val: number, currency = "USD") {
  const prefix = val < 0 ? "-" : "";
  const symbol = currency === "USD" ? "$" : currency;
  return prefix + symbol + " " + Math.abs(val).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = dateStr.split("T")[0]; // "YYYY-MM-DD"
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, m - 1, day); // local date, no timezone shift
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FecPipelinePage() {
  const { authenticated, email, role } = useAuth();
  const [ideas, setIdeas] = useState<FecIdea[]>([]);
  const [areas, setAreas] = useState<FecArea[]>([]);
  const [companies, setCompanies] = useState<FecCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterArea, setFilterArea] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCompany, setFilterCompany] = useState("");

  // New idea modal
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<"AHORRO" | "USO">("AHORRO");
  const [newAreaId, setNewAreaId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newProjectCurrency, setNewProjectCurrency] = useState("USD");
  const [newLeadId, setNewLeadId] = useState("");
  const [newImplDate, setNewImplDate] = useState("");
  const [newMonths, setNewMonths] = useState<number[]>(Array(12).fill(0));
  const [newPlLine, setNewPlLine] = useState("");
  const [newBsLine, setNewBsLine] = useState("");
  const [newCfLine, setNewCfLine] = useState("");
  const [newRevisedDate, setNewRevisedDate] = useState("");
  const [financialLines, setFinancialLines] = useState<{id: string; type: string; name: string}[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [creating, setCreating] = useState(false);

  // Status change modal
  const [statusModal, setStatusModal] = useState<{ idea: FecIdea; targetStatus: string } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCompany) params.set("companyId", filterCompany);

      const [ideasRes, areasRes, companiesRes, linesRes] = await Promise.all([
        fetch(`/api/fec/ideas${params.toString() ? "?" + params.toString() : ""}`),
        fetch("/api/fec/areas"),
        fetch("/api/fec/companies"),
        fetch("/api/fec/financial-lines"),
      ]);
      const ideasData = await ideasRes.json();
      const areasData = await areasRes.json();
      const companiesData = await companiesRes.json();
      const linesData = await linesRes.json();
      setIdeas(ideasData.ideas || []);
      setAreas(areasData.areas || []);
      setCompanies(companiesData.companies || []);
      setFinancialLines(linesData.lines || []);
    } catch {
      setError("Error cargando datos FEC");
    } finally {
      setLoading(false);
    }
  }, [filterCompany]);

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated, loadData]);

  async function loadEmployees() {
    try {
      const res = await fetch("/api/empleados");
      const data = await res.json();
      setEmployees(
        (data.employees || []).map((e: { id: string; fullName: string; email: string }) => ({
          id: e.id,
          fullName: e.fullName,
          email: e.email,
        }))
      );
    } catch {
      /* ignore */
    }
  }

  async function handleCreateIdea(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          ideaType: newType,
          areaId: newAreaId,
          companyId: newCompanyId,
          projectCurrency: newProjectCurrency,
          leadEmployeeId: newLeadId,
          implementationDate: newImplDate || null,
          revisedImplementationDate: newRevisedDate || null,
          plLine: newPlLine || null,
          bsLine: newBsLine || null,
          cfLine: newCfLine || null,
          ...Object.fromEntries(newMonths.map((v, i) => [`month${i + 1}Value`, v])),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error creando idea");
      }

      setSuccess("Idea creada exitosamente");
      setShowNewForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewType("AHORRO");
      setNewAreaId("");
      setNewCompanyId("");
      setNewProjectCurrency("USD");
      setNewLeadId("");
      setNewImplDate("");
      setNewRevisedDate("");
      setNewPlLine("");
      setNewBsLine("");
      setNewCfLine("");
      setNewMonths(Array(12).fill(0));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando idea");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange() {
    if (!statusModal) return;
    setChangingStatus(true);
    setError(null);

    try {
      const body: Record<string, string> = { status: statusModal.targetStatus };
      if (statusModal.targetStatus === "CANCELADA") body.cancelReason = statusReason;
      if (statusModal.targetStatus === "SUSPENDIDA") body.suspendReason = statusReason;
      body.statusChangeReason = statusReason;

      const res = await fetch(`/api/fec/ideas/${statusModal.idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error cambiando estado");
      }

      setSuccess(`Idea ${statusModal.idea.code} movida a ${statusModal.targetStatus}`);
      setStatusModal(null);
      setStatusReason("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cambiando estado");
    } finally {
      setChangingStatus(false);
    }
  }

  // Apply filters
  const filteredIdeas = ideas.filter((idea) => {
    if (filterArea && idea.areaId !== filterArea) return false;
    if (filterType && idea.ideaType !== filterType) return false;
    return true;
  });

  function getColumnIdeas(status: string) {
    return filteredIdeas.filter((i) => i.status === status);
  }

  // Summary KPIs
  const totalAhorro = filteredIdeas
    .filter((i) => i.ideaType === "AHORRO" && i.status === "IMPLEMENTADA")
    .reduce((sum, i) => sum + i.effectiveValue, 0);
  const totalAhorroUsd = filteredIdeas
    .filter((i) => i.ideaType === "AHORRO" && i.status === "IMPLEMENTADA")
    .reduce((sum, i) => sum + i.effectiveValueUsd, 0);
  const totalUso = filteredIdeas
    .filter((i) => i.ideaType === "USO" && i.status === "IMPLEMENTADA")
    .reduce((sum, i) => sum + i.effectiveValue, 0);
  const totalUsoUsd = filteredIdeas
    .filter((i) => i.ideaType === "USO" && i.status === "IMPLEMENTADA")
    .reduce((sum, i) => sum + i.effectiveValueUsd, 0);
  const totalPipeline = filteredIdeas
    .filter((i) => ["ESTUDIAR", "FIRME"].includes(i.status))
    .reduce((sum, i) => sum + i.annualizedValue, 0);
  const totalPipelineUsd = filteredIdeas
    .filter((i) => ["ESTUDIAR", "FIRME"].includes(i.status))
    .reduce((sum, i) => sum + i.annualizedValueUsd, 0);

  if (!authenticated) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financiando el Crecimiento (FEC)</h1>
          <p className="text-gray-500 text-sm">Pipeline de ideas de ahorro y uso de recursos</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setShowNewForm(true);
            if (employees.length === 0) loadEmployees();
          }}
        >
          + Nueva Idea
        </button>
      </div>

      {/* Alerts */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-4 font-medium underline">
            Cerrar
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 font-medium underline">
            Cerrar
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ahorro Implementado</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalAhorro, "Local")}</p>
          <p className="text-sm text-gray-400">{formatCurrency(totalAhorroUsd)} USD</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Uso Implementado</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalUso, "Local")}</p>
          <p className="text-sm text-gray-400">{formatCurrency(totalUsoUsd)} USD</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pipeline (Anualizado)</p>
          <p className="text-2xl font-bold text-woden-primary">{formatCurrency(totalPipeline, "Local")}</p>
          <p className="text-sm text-gray-400">{formatCurrency(totalPipelineUsd)} USD</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="input-field w-auto"
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
        >
          <option value="">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
          ))}
        </select>
        <select
          className="input-field w-auto"
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
        >
          <option value="">Todas las areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          className="input-field w-auto"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          <option value="AHORRO">Ahorro</option>
          <option value="USO">Uso</option>
        </select>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando pipeline...</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-[1100px]">
            {STATUS_COLUMNS.map((col) => {
              const colIdeas = getColumnIdeas(col.key);
              return (
                <div key={col.key} className="flex-1 min-w-[200px]">
                  {/* Column header */}
                  <div className={`${col.color} text-white text-sm font-medium px-3 py-2 rounded-t-sm flex justify-between items-center`}>
                    <span>{col.label}</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                      {colIdeas.length}
                    </span>
                  </div>

                  {/* Column body */}
                  <div className="bg-gray-50 border border-t-0 border-gray-200 rounded-b-sm min-h-[300px] p-2 space-y-2">
                    {colIdeas.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">Sin ideas</p>
                    ) : (
                      colIdeas.map((idea) => (
                        <div
                          key={idea.id}
                          className="bg-white border border-gray-200 rounded-sm p-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                          {/* Card header */}
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs text-gray-400 font-mono">{idea.code}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                idea.ideaType === "AHORRO"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {idea.ideaType}
                            </span>
                          </div>

                          {/* Title - clickable link to detail */}
                          <Link
                            href={`/fec/idea?id=${idea.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-woden-primary block mb-1 line-clamp-2"
                          >
                            {idea.title}
                          </Link>

                          {/* Company */}
                          <p className="text-xs text-woden-primary font-medium mb-0.5">{idea.company?.code || "—"}</p>

                          {/* Area & Lead */}
                          <p className="text-xs text-gray-500 mb-1">{idea.area.name}</p>
                          <p className="text-xs text-gray-400 mb-2">{idea.leadEmployee.fullName}</p>

                          {/* Values */}
                          <div className="text-xs mb-2 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Anualizado:</span>
                              <span className="font-medium">{formatCurrency(idea.annualizedValue, idea.projectCurrency)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">USD:</span>
                              <span className="text-gray-500">{formatCurrency(idea.annualizedValueUsd)}</span>
                            </div>
                          </div>

                          {/* Implementation date */}
                          {(idea.implementationDate || idea.revisedImplementationDate) && (
                            <p className="text-xs text-gray-400 mb-2">
                              Impl: {formatDate(idea.revisedImplementationDate || idea.implementationDate)}
                            </p>
                          )}

                          {/* Analyst approval badge */}
                          {idea.analystApprovalRequired && (
                            <div className="mb-2">
                              {idea.analystApprovedBy ? (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                  Aprobada por analista
                                </span>
                              ) : (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                                  Pendiente aprobacion
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
                            <Link
                              href={`/fec/idea?id=${idea.id}`}
                              className="text-[10px] px-2 py-1 rounded-sm border border-woden-primary text-woden-primary hover:bg-woden-primary hover:text-white transition-colors font-medium"
                            >
                              Editar
                            </Link>
                            {STATUS_TRANSITIONS[idea.status]?.map((target) => (
                              <button
                                key={target}
                                onClick={() => {
                                  setStatusModal({ idea, targetStatus: target });
                                  setStatusReason("");
                                }}
                                className="text-[10px] px-2 py-1 rounded-sm border border-gray-200 text-gray-500 hover:text-woden-primary hover:border-woden-primary transition-colors"
                              >
                                {"\u2192"} {target.charAt(0) + target.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Idea Modal */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Nueva Idea FEC</h2>
              <button
                onClick={() => setShowNewForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateIdea} className="space-y-4">
              <div>
                <label className="label-field">Titulo *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label-field">Descripcion *</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">Empresa *</label>
                  <select
                    className="input-field"
                    value={newCompanyId}
                    onChange={(e) => {
                      setNewCompanyId(e.target.value);
                      const sel = companies.find((c) => c.id === e.target.value);
                      if (sel) setNewProjectCurrency(sel.currency);
                    }}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-field">Moneda del Proyecto *</label>
                  <select
                    className="input-field"
                    value={newProjectCurrency}
                    onChange={(e) => setNewProjectCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">Tipo *</label>
                  <select
                    className="input-field"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "AHORRO" | "USO")}
                  >
                    <option value="AHORRO">Ahorro</option>
                    <option value="USO">Uso</option>
                  </select>
                </div>

                <div>
                  <label className="label-field">Area *</label>
                  <select
                    className="input-field"
                    value={newAreaId}
                    onChange={(e) => setNewAreaId(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-field">Lider Responsable *</label>
                <select
                  className="input-field"
                  value={newLeadId}
                  onChange={(e) => setNewLeadId(e.target.value)}
                  required
                >
                  <option value="">Seleccionar empleado...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Financial classification */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label-field">Linea de P&G</label>
                  <select
                    className="input-field"
                    value={newPlLine}
                    onChange={(e) => setNewPlLine(e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "PL").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Linea de Balance</label>
                  <select
                    className="input-field"
                    value={newBsLine}
                    onChange={(e) => setNewBsLine(e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "BS").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Linea de Flujo de Caja</label>
                  <select
                    className="input-field"
                    value={newCfLine}
                    onChange={(e) => setNewCfLine(e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "CF").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">Fecha de Implementacion</label>
                  <input
                    type="date"
                    className="input-field"
                    value={newImplDate}
                    onChange={(e) => setNewImplDate(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    No podra ser modificada despues excepto por el Analista Financiero.
                  </p>
                </div>
                <div>
                  <label className="label-field">Fecha Revisada de Implementacion</label>
                  <input
                    type="date"
                    className="input-field"
                    value={newRevisedDate}
                    onChange={(e) => setNewRevisedDate(e.target.value)}
                  />
                </div>
              </div>

              {/* 12-month values - Project Currency only */}
              <div>
                <label className="label-field">Valores mensuales en {newProjectCurrency}</label>
                <p className="text-xs text-gray-400 mb-2">
                  Los valores en USD se calculan automaticamente usando los tipos de cambio configurados.
                </p>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-6 gap-1">
                    {MONTH_LABELS.map((label, i) => (
                      <div key={i} className="text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                        <input
                          type="number"
                          className="input-field text-center text-xs w-full px-1 py-1"
                          value={newMonths[i] || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const updated = [...newMonths];
                            updated[i] = parseFloat(e.target.value) || 0;
                            setNewMonths(updated);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? "Creando..." : "Crear Idea"}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setShowNewForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Cambiar Estado</h2>
            <p className="text-sm text-gray-600 mb-4">
              Mover <strong>{statusModal.idea.code}</strong> de{" "}
              <span className="font-medium">{statusModal.idea.status}</span> a{" "}
              <span className="font-medium">{statusModal.targetStatus}</span>
            </p>

            {(statusModal.targetStatus === "CANCELADA" || statusModal.targetStatus === "SUSPENDIDA") && (
              <div className="mb-4">
                <label className="label-field">
                  Razon {statusModal.targetStatus === "CANCELADA" ? "de cancelacion" : "de suspension"} *
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  required
                />
              </div>
            )}

            {statusModal.targetStatus !== "CANCELADA" && statusModal.targetStatus !== "SUSPENDIDA" && (
              <div className="mb-4">
                <label className="label-field">Comentario (opcional)</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleStatusChange}
                className="btn-primary flex-1"
                disabled={
                  changingStatus ||
                  ((statusModal.targetStatus === "CANCELADA" || statusModal.targetStatus === "SUSPENDIDA") && !statusReason.trim())
                }
              >
                {changingStatus ? "Procesando..." : "Confirmar"}
              </button>
              <button
                onClick={() => { setStatusModal(null); setStatusReason(""); }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
