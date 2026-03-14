"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
  leadEmployeeId: string;
  leadEmployee: { id: string; fullName: string; email: string };
  plLine: string | null;
  bsLine: string | null;
  cfLine: string | null;
  implementationDate: string | null;
  revisedImplementationDate: string | null;
  month1Value: number;
  month2Value: number;
  month3Value: number;
  month4Value: number;
  month5Value: number;
  month6Value: number;
  month7Value: number;
  month8Value: number;
  month9Value: number;
  month10Value: number;
  month11Value: number;
  month12Value: number;
  month1Usd: number;
  month2Usd: number;
  month3Usd: number;
  month4Usd: number;
  month5Usd: number;
  month6Usd: number;
  month7Usd: number;
  month8Usd: number;
  month9Usd: number;
  month10Usd: number;
  month11Usd: number;
  month12Usd: number;
  annualizedValue: number;
  effectiveValue: number;
  annualizedValueUsd: number;
  effectiveValueUsd: number;
  analystApprovalRequired: boolean;
  analystApprovedBy: string | null;
  analystApprovedAt: string | null;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  statusHistory: {
    id: string;
    fromStatus: string;
    toStatus: string;
    changedByName: string;
    reason: string | null;
    createdAt: string;
  }[];
}

interface FecArea {
  id: string;
  name: string;
}

const CURRENCIES = ["PEN", "COP", "BRL", "USD", "EUR", "MXN", "CRC"];

const MONTH_LABELS = [
  "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6",
  "Mes 7", "Mes 8", "Mes 9", "Mes 10", "Mes 11", "Mes 12",
];

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

function FecIdeaDetail() {
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("id");
  const { authenticated, email, role } = useAuth();

  const [idea, setIdea] = useState<FecIdea | null>(null);
  const [areas, setAreas] = useState<FecArea[]>([]);
  const [companies, setCompanies] = useState<FecCompany[]>([]);
  const [financialLines, setFinancialLines] = useState<{id: string; type: string; name: string}[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAreaId, setEditAreaId] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editProjectCurrency, setEditProjectCurrency] = useState("USD");
  const [editLeadId, setEditLeadId] = useState("");
  const [editPlLine, setEditPlLine] = useState("");
  const [editBsLine, setEditBsLine] = useState("");
  const [editCfLine, setEditCfLine] = useState("");
  const [editImplDate, setEditImplDate] = useState("");
  const [editRevisedDate, setEditRevisedDate] = useState("");
  const [editMonths, setEditMonths] = useState<number[]>(Array(12).fill(0));
  // USD months are auto-calculated by the API from exchange rates

  // User role info
  const [userIsAnalyst, setUserIsAnalyst] = useState(false);
  const [userAreaIds, setUserAreaIds] = useState<string[]>([]);

  const loadIdea = useCallback(async () => {
    if (!ideaId) return;
    try {
      const [ideaRes, areasRes, empRes, rolesRes, companiesRes, linesRes] = await Promise.all([
        fetch(`/api/fec/ideas/${ideaId}`),
        fetch("/api/fec/areas"),
        fetch("/api/empleados"),
        fetch("/api/fec/roles"),
        fetch("/api/fec/companies"),
        fetch("/api/fec/financial-lines"),
      ]);

      const ideaData = await ideaRes.json();
      if (!ideaRes.ok) throw new Error(ideaData.error);

      const areasData = await areasRes.json();
      const empData = await empRes.json();
      const rolesData = await rolesRes.json();
      const companiesData = await companiesRes.json();
      const linesData = await linesRes.json();

      setIdea(ideaData);
      setAreas(areasData.areas || []);
      setCompanies(companiesData.companies || []);
      setFinancialLines(linesData.lines || []);
      setEmployees(
        (empData.employees || []).map((e: { id: string; fullName: string; email: string }) => ({
          id: e.id, fullName: e.fullName, email: e.email,
        }))
      );

      // Determine user permissions
      const roles = rolesData.roles || [];
      const myRoles = roles.filter(
        (r: { employee: { email: string }; role: string; area: { id: string } | null }) =>
          r.employee.email === email
      );
      setUserIsAnalyst(myRoles.some((r: { role: string }) => r.role === "ANALISTA_FINANCIERO"));
      setUserAreaIds(
        myRoles
          .filter((r: { role: string; area: { id: string } | null }) => r.role === "RESPONSABLE_AREA" && r.area)
          .map((r: { area: { id: string } | null }) => r.area!.id)
      );

      // Populate edit fields
      setEditTitle(ideaData.title);
      setEditDescription(ideaData.description);
      setEditAreaId(ideaData.areaId);
      setEditCompanyId(ideaData.companyId);
      setEditProjectCurrency(ideaData.projectCurrency || "USD");
      setEditLeadId(ideaData.leadEmployeeId);
      setEditPlLine(ideaData.plLine || "");
      setEditBsLine(ideaData.bsLine || "");
      setEditCfLine(ideaData.cfLine || "");
      setEditImplDate(ideaData.implementationDate ? ideaData.implementationDate.split("T")[0] : "");
      setEditRevisedDate(ideaData.revisedImplementationDate ? ideaData.revisedImplementationDate.split("T")[0] : "");
      setEditMonths(
        Array.from({ length: 12 }, (_, i) => ideaData[`month${i + 1}Value`] || 0)
      );
      // USD months are read-only (auto-calculated by API)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando idea");
    } finally {
      setLoading(false);
    }
  }, [ideaId, email]);

  useEffect(() => {
    if (authenticated && ideaId) loadIdea();
  }, [authenticated, ideaId, loadIdea]);

  const isAdmin = role === "ADMINISTRADOR";
  const canEdit = isAdmin || userIsAnalyst || userAreaIds.includes(idea?.areaId || "");

  async function handleSave() {
    if (!idea) return;
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: editTitle,
        description: editDescription,
        areaId: editAreaId,
        companyId: editCompanyId,
        projectCurrency: editProjectCurrency,
        leadEmployeeId: editLeadId,
        plLine: editPlLine || null,
        bsLine: editBsLine || null,
        cfLine: editCfLine || null,
        revisedImplementationDate: editRevisedDate || null,
      };

      // Only analyst or admin can change implementation date
      if (userIsAnalyst || isAdmin) {
        body.implementationDate = editImplDate || null;
      }

      // Local currency month values
      for (let i = 0; i < 12; i++) {
        body[`month${i + 1}Value`] = editMonths[i];
      }

      // USD months are auto-calculated by the API from exchange rates

      const res = await fetch(`/api/fec/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Idea actualizada exitosamente");
      setEditing(false);
      await loadIdea();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalystApprove() {
    if (!idea) return;
    try {
      const res = await fetch(`/api/fec/ideas/${idea.id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSuccess("Idea aprobada por analista financiero");
      await loadIdea();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error aprobando");
    }
  }

  // Calculate effective/annualized from edit values
  const effectiveCalc = editMonths.reduce((a, b) => a + b, 0);
  const nonZero = editMonths.filter((v) => v !== 0).length;
  const annualizedCalc = nonZero > 0 ? (effectiveCalc / nonZero) * 12 : 0;

  // USD values are auto-calculated by API from exchange rates

  if (!ideaId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No se especifico una idea.</p>
        <Link href="/fec" className="text-woden-primary hover:underline mt-2 inline-block">
          Volver al Pipeline
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Cargando idea...</div>;
  }

  if (!idea) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || "Idea no encontrada"}</p>
        <Link href="/fec" className="text-woden-primary hover:underline mt-2 inline-block">
          Volver al Pipeline
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/fec" className="text-sm text-woden-primary hover:underline">
          {"\u2190"} Pipeline FEC
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="text-sm font-mono text-gray-400">{idea.code}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                idea.ideaType === "AHORRO"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {idea.ideaType}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                idea.status === "IMPLEMENTADA"
                  ? "bg-green-100 text-green-800"
                  : idea.status === "FIRME"
                  ? "bg-yellow-100 text-yellow-800"
                  : idea.status === "CANCELADA"
                  ? "bg-red-100 text-red-800"
                  : idea.status === "SUSPENDIDA"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {idea.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
              {idea.company?.code || "\u2014"} | {idea.projectCurrency}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editing ? (
              <input
                type="text"
                className="input-field text-2xl font-bold"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            ) : (
              idea.title
            )}
          </h1>
        </div>
        {canEdit && !editing && (
          <button className="btn-primary" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button className="btn-secondary" onClick={() => { setEditing(false); loadIdea(); }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-4 font-medium underline">Cerrar</button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 font-medium underline">Cerrar</button>
        </div>
      )}

      {/* Analyst approval banner */}
      {idea.analystApprovalRequired && !idea.analystApprovedBy && userIsAnalyst && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-sm flex justify-between items-center">
          <span className="text-sm text-yellow-800">
            Esta idea tipo USO requiere aprobacion del Analista Financiero.
          </span>
          <button className="btn-primary text-sm" onClick={handleAnalystApprove}>
            Aprobar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Descripcion</h3>
            {editing ? (
              <textarea
                className="input-field"
                rows={4}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{idea.description}</p>
            )}
          </div>

          {/* Financial classification */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Clasificacion Financiera</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">Linea de P&G</label>
                {editing ? (
                  <select className="input-field" value={editPlLine} onChange={(e) => setEditPlLine(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "PL").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-700">{idea.plLine || "\u2014"}</p>
                )}
              </div>
              <div>
                <label className="label-field">Linea de Balance</label>
                {editing ? (
                  <select className="input-field" value={editBsLine} onChange={(e) => setEditBsLine(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "BS").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-700">{idea.bsLine || "\u2014"}</p>
                )}
              </div>
              <div>
                <label className="label-field">Linea de Flujo de Caja</label>
                {editing ? (
                  <select className="input-field" value={editCfLine} onChange={(e) => setEditCfLine(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {financialLines.filter(l => l.type === "CF").map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-700">{idea.cfLine || "\u2014"}</p>
                )}
              </div>
            </div>
          </div>

          {/* 12-month values grid - Project Currency */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Valores en {editing ? editProjectCurrency : idea.projectCurrency}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {MONTH_LABELS.map((label) => (
                      <th key={label} className="table-header text-center text-xs px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {editMonths.map((val, i) => (
                      <td key={i} className="table-cell text-center px-1 py-2">
                        {editing ? (
                          <input
                            type="number"
                            className="input-field text-center text-sm w-20"
                            value={val}
                            onChange={(e) => {
                              const newMonths = [...editMonths];
                              newMonths[i] = parseFloat(e.target.value) || 0;
                              setEditMonths(newMonths);
                            }}
                          />
                        ) : (
                          <span className={val < 0 ? "text-red-600" : val > 0 ? "text-green-600" : "text-gray-400"}>
                            {formatCurrency(val, idea.projectCurrency)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex gap-6 mt-4 pt-3 border-t border-gray-200">
              <div>
                <span className="text-xs text-gray-500">Valor Efectivo (Suma):</span>
                <span className="ml-2 font-bold text-sm">
                  {formatCurrency(editing ? effectiveCalc : idea.effectiveValue, idea.projectCurrency)}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Valor Anualizado (Promedio x 12):</span>
                <span className="ml-2 font-bold text-sm">
                  {formatCurrency(editing ? annualizedCalc : idea.annualizedValue, idea.projectCurrency)}
                </span>
              </div>
            </div>
          </div>

          {/* 12-month values grid - USD (read-only, auto-calculated) */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Valores en USD</h3>
            <p className="text-xs text-gray-400 mb-3">
              Calculados automaticamente desde los tipos de cambio configurados.
              {editing && " Se recalcularan al guardar."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {MONTH_LABELS.map((label) => (
                      <th key={label} className="table-header text-center text-xs px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {Array.from({ length: 12 }, (_, i) => {
                      const val = (idea as unknown as Record<string, number>)[`month${i + 1}Usd`] || 0;
                      return (
                        <td key={i} className="table-cell text-center px-1 py-2">
                          <span className={val < 0 ? "text-red-600" : val > 0 ? "text-green-600" : "text-gray-400"}>
                            {formatCurrency(val)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals USD */}
            <div className="flex gap-6 mt-4 pt-3 border-t border-gray-200">
              <div>
                <span className="text-xs text-gray-500">Valor Efectivo USD (Suma):</span>
                <span className="ml-2 font-bold text-sm">
                  {formatCurrency(idea.effectiveValueUsd)}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Valor Anualizado USD (Promedio x 12):</span>
                <span className="ml-2 font-bold text-sm">
                  {formatCurrency(idea.annualizedValueUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Status History */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Historial de Estados</h3>
            {idea.statusHistory.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cambios de estado registrados.</p>
            ) : (
              <div className="space-y-2">
                {idea.statusHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400 min-w-[90px]">
                      {new Date(entry.createdAt).toLocaleDateString("es-PE")}
                    </span>
                    <span className="text-gray-600">
                      <strong>{entry.changedByName}</strong> cambio de{" "}
                      <span className="font-medium">{entry.fromStatus}</span> a{" "}
                      <span className="font-medium">{entry.toStatus}</span>
                      {entry.reason && (
                        <span className="text-gray-400 ml-1">{"\u2014"} {entry.reason}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column - metadata */}
        <div className="space-y-6">
          {/* Details card */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Detalles</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Empresa:</span>
                {editing ? (
                  <select className="input-field mt-1" value={editCompanyId} onChange={(e) => {
                    setEditCompanyId(e.target.value);
                    const sel = companies.find((c) => c.id === e.target.value);
                    if (sel) setEditProjectCurrency(sel.currency);
                  }}>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-medium text-gray-900">{idea.company?.code} - {idea.company?.name}</p>
                )}
              </div>

              <div>
                <span className="text-gray-500">Moneda del Proyecto:</span>
                {editing ? (
                  <select className="input-field mt-1" value={editProjectCurrency} onChange={(e) => setEditProjectCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-medium text-gray-900">{idea.projectCurrency}</p>
                )}
              </div>

              <div>
                <span className="text-gray-500">Area:</span>
                {editing ? (
                  <select className="input-field mt-1" value={editAreaId} onChange={(e) => setEditAreaId(e.target.value)}>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-medium text-gray-900">{idea.area.name}</p>
                )}
              </div>

              <div>
                <span className="text-gray-500">Lider Responsable:</span>
                {editing ? (
                  <select className="input-field mt-1" value={editLeadId} onChange={(e) => setEditLeadId(e.target.value)}>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-medium text-gray-900">{idea.leadEmployee.fullName}</p>
                )}
              </div>

              <div>
                <span className="text-gray-500">Fecha de Implementacion:</span>
                {editing && (userIsAnalyst || isAdmin) ? (
                  <input
                    type="date"
                    className="input-field mt-1"
                    value={editImplDate}
                    onChange={(e) => setEditImplDate(e.target.value)}
                  />
                ) : (
                  <p className="font-medium text-gray-900">{formatDate(idea.implementationDate)}</p>
                )}
                {editing && !userIsAnalyst && !isAdmin && idea.implementationDate && (
                  <p className="text-xs text-gray-400 mt-1">Solo el analista financiero puede cambiar esta fecha</p>
                )}
              </div>

              <div>
                <span className="text-gray-500">Fecha Revisada:</span>
                {editing ? (
                  <input
                    type="date"
                    className="input-field mt-1"
                    value={editRevisedDate}
                    onChange={(e) => setEditRevisedDate(e.target.value)}
                  />
                ) : (
                  <p className="font-medium text-gray-900">{formatDate(idea.revisedImplementationDate)}</p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <span className="text-gray-500">Creada por:</span>
                <p className="text-gray-700">{idea.createdByName}</p>
                <p className="text-xs text-gray-400">{formatDate(idea.createdAt)}</p>
              </div>

              {idea.analystApprovedBy && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Aprobada por analista:</span>
                  <p className="text-green-700 font-medium">{idea.analystApprovedBy}</p>
                  <p className="text-xs text-gray-400">{formatDate(idea.analystApprovedAt)}</p>
                </div>
              )}

              {idea.cancelReason && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Razon de cancelacion:</span>
                  <p className="text-red-600">{idea.cancelReason}</p>
                </div>
              )}

              {idea.suspendReason && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Razon de suspension:</span>
                  <p className="text-orange-600">{idea.suspendReason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Values summary */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Resumen de Valores</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Moneda del Proyecto ({idea.projectCurrency})</p>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Valor Efectivo:</span>
                  <span className={`font-bold ${idea.effectiveValue >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(idea.effectiveValue, idea.projectCurrency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Valor Anualizado:</span>
                  <span className={`font-bold ${idea.annualizedValue >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(idea.annualizedValue, idea.projectCurrency)}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">USD</p>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Valor Efectivo:</span>
                  <span className={`font-bold ${idea.effectiveValueUsd >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(idea.effectiveValueUsd)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Valor Anualizado:</span>
                  <span className={`font-bold ${idea.annualizedValueUsd >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(idea.annualizedValueUsd)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FecIdeaPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Cargando...</div>}>
      <FecIdeaDetail />
    </Suspense>
  );
}
