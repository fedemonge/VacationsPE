"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

interface StaffKPIs {
  activeHeadcount: number;
  vacantPositions: number;
  thirdPartyCount: number;
  pendingRequests: number;
  avgTimeToHireDays: number | null;
  hiresThisMonth: number;
  terminationsThisMonth: number;
}

interface MonthlyTrend {
  month: string;
  monthLabel: string;
  hires: number;
  terminations: number;
  headcount: number;
  vacantPositions: number;
  thirdPartyCount: number;
}

interface StaffRequestItem {
  id: string;
  requestType: string;
  positionId: string | null;
  positionTitle: string;
  costCenter: string;
  costCenterDesc: string;
  reportsToEmail: string;
  positionType: string;
  justification: string;
  requestedByEmail: string;
  requestedByName: string;
  supervisorName: string;
  supervisorEmail: string;
  status: string;
  currentApprovalLevel: number;
  createdAt: string;
  approvedAt: string | null;
  hiredEmployeeId: string | null;
  hiredAt: string | null;
}

interface Employee {
  id: string;
  fullName: string;
  email: string;
  hireDate: string;
}

interface CostCenter {
  id: string;
  code: string;
  description: string;
}

const STATUS_LABELS: Record<string, string> = {
  NIVEL_1_PENDIENTE: "Nivel 1 - Supervisor",
  NIVEL_2_PENDIENTE: "Nivel 2 - RRHH",
  NIVEL_3_PENDIENTE: "Nivel 3 - Gerencia",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  NUEVA_POSICION: "Nueva Posición",
  CONTRATACION: "Contratación",
};

function getStatusBadge(status: string): string {
  if (status === "APROBADA") return "badge-aprobada";
  if (status === "RECHAZADA" || status === "CANCELADA") return "badge-rechazada";
  return "badge-pendiente";
}

export default function PanelPersonalPage() {
  const { authenticated, email, role } = useAuth();
  const [activeTab, setActiveTab] = useState<"kpis" | "aprobaciones" | "reportes">("kpis");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // KPIs data
  const [kpis, setKpis] = useState<StaffKPIs | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);

  // Approvals data
  const [pendingRequests, setPendingRequests] = useState<StaffRequestItem[]>([]);
  const [allRequests, setAllRequests] = useState<StaffRequestItem[]>([]);

  // Hire completion
  const [completingHire, setCompletingHire] = useState<string | null>(null);
  const [hireEmployeeId, setHireEmployeeId] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Report filters
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [reportCostCenter, setReportCostCenter] = useState("");
  const [showEmployees, setShowEmployees] = useState(true);
  const [showVacant, setShowVacant] = useState(true);
  const [showThirdParty, setShowThirdParty] = useState(true);

  // Approval modal
  const [approvalModal, setApprovalModal] = useState<{
    request: StaffRequestItem;
    action: "approve" | "reject" | "return";
  } | null>(null);
  const [approvalComments, setApprovalComments] = useState("");
  const [approvalLoading, setApprovalLoading] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const params = reportCostCenter
        ? `?costCenter=${encodeURIComponent(reportCostCenter)}`
        : "";
      const res = await fetch(`/api/reportes/personal${params}`);
      const data = await res.json();
      setKpis(data.kpis || null);
      setMonthlyTrend(data.monthlyTrend || []);
    } catch {
      // silent
    }
  }, [reportCostCenter]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/solicitudes-personal");
      const data = await res.json();
      const all: StaffRequestItem[] = data.solicitudes || [];
      setAllRequests(all);

      // Filter pending requests that this user can approve
      const pending = all.filter((r) => r.status.includes("PENDIENTE"));
      setPendingRequests(pending);
    } catch {
      // silent
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [, , empRes, ccRes] = await Promise.all([
        loadReports(),
        loadRequests(),
        fetch("/api/empleados"),
        fetch("/api/centros-costos"),
      ]);
      const empData = await empRes.json();
      const ccData = await ccRes.json();
      setEmployees(
        (empData.empleados || []).filter(
          (e: Employee & { terminationDate: string | null }) => !e.terminationDate
        )
      );
      setCostCenters(ccData.centros || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [loadReports, loadRequests]);

  useEffect(() => {
    if (authenticated) loadAll();
  }, [authenticated, loadAll]);

  useEffect(() => {
    if (authenticated) loadReports();
  }, [authenticated, reportCostCenter, loadReports]);

  async function handleApproval() {
    if (!approvalModal) return;
    setApprovalLoading(true);
    setMessage(null);

    try {
      const { request, action } = approvalModal;

      if (action === "return") {
        const res = await fetch("/api/aprobaciones/devolver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: request.id,
            requestType: request.requestType,
            comments: approvalComments,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: data.error });
        } else {
          setMessage({ type: "success", text: data.message });
        }
      } else {
        const decision = action === "approve" ? "APROBADO" : "RECHAZADO";
        const res = await fetch("/api/aprobaciones/decidir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: request.id,
            decision,
            requestType: request.requestType,
            comments: approvalComments,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: data.error });
        } else {
          setMessage({ type: "success", text: data.message });
        }
      }

      setApprovalModal(null);
      setApprovalComments("");
      loadRequests();
      loadReports();
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleCompleteHire(requestId: string) {
    if (!hireEmployeeId || !hireDate) return;
    setApprovalLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/solicitudes-personal/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hiredEmployeeId: hireEmployeeId,
          hiredAt: hireDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: "Contratación registrada exitosamente" });
        setCompletingHire(null);
        setHireEmployeeId("");
        setHireDate("");
        loadAll();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setApprovalLoading(false);
    }
  }

  function canApproveRequest(req: StaffRequestItem): boolean {
    const lvl = req.currentApprovalLevel;
    if (role === "ADMINISTRADOR") return true;
    if (lvl === 1) {
      const e = email.toLowerCase();
      return (
        req.supervisorEmail.toLowerCase() === e ||
        req.supervisorName.toLowerCase() === e
      );
    }
    if (lvl === 2) return role === "RRHH";
    if (lvl === 3) return role === "GERENTE_PAIS";
    return false;
  }

  function canReturnRequest(req: StaffRequestItem): boolean {
    if (req.currentApprovalLevel <= 1) return false;
    if (role === "ADMINISTRADOR") return true;
    if (req.currentApprovalLevel === 2 && role === "RRHH") return true;
    if (req.currentApprovalLevel === 3 && role === "GERENTE_PAIS") return true;
    return false;
  }

  if (!authenticated) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Panel de Personal
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        KPIs, aprobaciones y reportes de gestión de personal
      </p>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-sm text-sm ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            { key: "kpis", label: "KPIs" },
            { key: "aprobaciones", label: `Aprobaciones (${pendingRequests.length})` },
            { key: "reportes", label: "Reportes" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-woden-primary text-woden-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center text-gray-400 py-12">Cargando...</div>
      ) : (
        <>
          {/* KPIs Tab */}
          {activeTab === "kpis" && kpis && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-green-600">
                    {kpis.activeHeadcount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Headcount Activo
                  </p>
                </div>
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-gray-500">
                    {kpis.vacantPositions}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Posiciones Vacantes
                  </p>
                </div>
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-purple-600">
                    {kpis.thirdPartyCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Terceros</p>
                </div>
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-woden-primary">
                    {kpis.pendingRequests}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Solicitudes Pendientes
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-blue-600">
                    {kpis.avgTimeToHireDays !== null
                      ? `${kpis.avgTimeToHireDays} días`
                      : "N/A"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Tiempo Promedio de Contratación
                  </p>
                </div>
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-green-500">
                    {kpis.hiresThisMonth}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Altas del Mes
                  </p>
                </div>
                <div className="card text-center p-4">
                  <p className="text-3xl font-bold text-red-500">
                    {kpis.terminationsThisMonth}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Bajas del Mes
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Approvals Tab */}
          {activeTab === "aprobaciones" && (
            <div>
              {/* Pending Approvals */}
              <h3 className="text-md font-semibold text-gray-900 mb-3">
                Solicitudes Pendientes
              </h3>
              {pendingRequests.length === 0 ? (
                <div className="card text-center text-gray-400 mb-8">
                  No hay solicitudes de personal pendientes
                </div>
              ) : (
                <div className="card overflow-x-auto p-0 mb-8">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Tipo</th>
                        <th className="table-header">Puesto</th>
                        <th className="table-header">Solicitante</th>
                        <th className="table-header">C. Costo</th>
                        <th className="table-header">Nivel</th>
                        <th className="table-header">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRequests.map((req) => (
                        <tr
                          key={req.id}
                          className="hover:bg-woden-primary-lighter"
                        >
                          <td className="table-cell">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                req.requestType === "NUEVA_POSICION"
                                  ? "bg-teal-100 text-teal-700"
                                  : "bg-indigo-100 text-indigo-700"
                              }`}
                            >
                              {REQUEST_TYPE_LABELS[req.requestType] ||
                                req.requestType}
                            </span>
                          </td>
                          <td className="table-cell">
                            <p className="font-medium text-sm">
                              {req.positionTitle}
                            </p>
                            <p className="text-xs text-gray-400">
                              Reporta a: {req.reportsToEmail}
                            </p>
                          </td>
                          <td className="table-cell text-sm">
                            {req.requestedByName}
                          </td>
                          <td className="table-cell text-sm">
                            {req.costCenter}
                          </td>
                          <td className="table-cell">
                            <span className="badge-pendiente">
                              {STATUS_LABELS[req.status] || req.status}
                            </span>
                          </td>
                          <td className="table-cell">
                            <div className="flex gap-2">
                              {canApproveRequest(req) && (
                                <>
                                  <button
                                    className="text-xs text-green-600 hover:underline"
                                    onClick={() =>
                                      setApprovalModal({
                                        request: req,
                                        action: "approve",
                                      })
                                    }
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    className="text-xs text-red-500 hover:underline"
                                    onClick={() =>
                                      setApprovalModal({
                                        request: req,
                                        action: "reject",
                                      })
                                    }
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              {canReturnRequest(req) && (
                                <button
                                  className="text-xs text-woden-primary hover:underline"
                                  onClick={() =>
                                    setApprovalModal({
                                      request: req,
                                      action: "return",
                                    })
                                  }
                                >
                                  Devolver
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Approved requests pending hire completion */}
              <h3 className="text-md font-semibold text-gray-900 mb-3">
                Aprobadas - Pendientes de Contratación
              </h3>
              {(() => {
                const approvedPendingHire = allRequests.filter(
                  (r) => r.status === "APROBADA" && !r.hiredAt
                );
                if (approvedPendingHire.length === 0) {
                  return (
                    <div className="card text-center text-gray-400 mb-8">
                      No hay solicitudes aprobadas pendientes de contratación
                    </div>
                  );
                }
                return (
                  <div className="card overflow-x-auto p-0 mb-8">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-header">Tipo</th>
                          <th className="table-header">Puesto</th>
                          <th className="table-header">C. Costo</th>
                          <th className="table-header">Aprobada</th>
                          <th className="table-header">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvedPendingHire.map((req) => (
                          <tr
                            key={req.id}
                            className="hover:bg-woden-primary-lighter"
                          >
                            <td className="table-cell">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  req.requestType === "NUEVA_POSICION"
                                    ? "bg-teal-100 text-teal-700"
                                    : "bg-indigo-100 text-indigo-700"
                                }`}
                              >
                                {REQUEST_TYPE_LABELS[req.requestType]}
                              </span>
                            </td>
                            <td className="table-cell">{req.positionTitle}</td>
                            <td className="table-cell">{req.costCenter}</td>
                            <td className="table-cell text-xs text-gray-500">
                              {req.approvedAt
                                ? new Date(req.approvedAt).toLocaleDateString("es-PE")
                                : "-"}
                            </td>
                            <td className="table-cell">
                              {["ADMINISTRADOR", "RRHH"].includes(role) && (
                                <>
                                  {completingHire === req.id ? (
                                    <div className="space-y-2">
                                      <select
                                        className="input-field text-xs"
                                        value={hireEmployeeId}
                                        onChange={(e) =>
                                          setHireEmployeeId(e.target.value)
                                        }
                                      >
                                        <option value="">
                                          Seleccionar empleado
                                        </option>
                                        {employees.map((emp) => (
                                          <option key={emp.id} value={emp.id}>
                                            {emp.fullName} ({emp.email})
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="date"
                                        className="input-field text-xs"
                                        value={hireDate}
                                        onChange={(e) =>
                                          setHireDate(e.target.value)
                                        }
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          className="text-xs text-green-600 hover:underline"
                                          onClick={() =>
                                            handleCompleteHire(req.id)
                                          }
                                          disabled={
                                            !hireEmployeeId || !hireDate || approvalLoading
                                          }
                                        >
                                          Confirmar
                                        </button>
                                        <button
                                          className="text-xs text-gray-400 hover:underline"
                                          onClick={() => {
                                            setCompletingHire(null);
                                            setHireEmployeeId("");
                                            setHireDate("");
                                          }}
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-xs text-woden-primary hover:underline"
                                      onClick={() =>
                                        setCompletingHire(req.id)
                                      }
                                    >
                                      Registrar Contratación
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* History */}
              <h3 className="text-md font-semibold text-gray-900 mb-3">
                Historial de Solicitudes
              </h3>
              {allRequests.filter((r) => !r.status.includes("PENDIENTE"))
                .length === 0 ? (
                <div className="card text-center text-gray-400">
                  No hay historial de solicitudes
                </div>
              ) : (
                <div className="card overflow-x-auto p-0">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Tipo</th>
                        <th className="table-header">Puesto</th>
                        <th className="table-header">Solicitante</th>
                        <th className="table-header">Estado</th>
                        <th className="table-header">Tiempo Contratación</th>
                        <th className="table-header">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRequests
                        .filter((r) => !r.status.includes("PENDIENTE"))
                        .map((req) => {
                          let timeToHire = "-";
                          if (req.approvedAt && req.hiredAt) {
                            const diff =
                              new Date(req.hiredAt).getTime() -
                              new Date(req.approvedAt).getTime();
                            const days = Math.round(
                              diff / (1000 * 60 * 60 * 24)
                            );
                            timeToHire = `${days} días`;
                          }

                          return (
                            <tr
                              key={req.id}
                              className="hover:bg-woden-primary-lighter"
                            >
                              <td className="table-cell">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    req.requestType === "NUEVA_POSICION"
                                      ? "bg-teal-100 text-teal-700"
                                      : "bg-indigo-100 text-indigo-700"
                                  }`}
                                >
                                  {REQUEST_TYPE_LABELS[req.requestType]}
                                </span>
                              </td>
                              <td className="table-cell">{req.positionTitle}</td>
                              <td className="table-cell text-sm">
                                {req.requestedByName}
                              </td>
                              <td className="table-cell">
                                <span className={getStatusBadge(req.status)}>
                                  {STATUS_LABELS[req.status] || req.status}
                                </span>
                              </td>
                              <td className="table-cell text-sm">
                                {timeToHire}
                              </td>
                              <td className="table-cell text-xs text-gray-500">
                                {new Date(req.createdAt).toLocaleDateString(
                                  "es-PE"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === "reportes" && (
            <div>
              {/* Report filters */}
              <div className="card mb-6">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <div className="flex-1">
                    <label className="label-field">Centro de Costos</label>
                    <select
                      className="input-field"
                      value={reportCostCenter}
                      onChange={(e) => setReportCostCenter(e.target.value)}
                    >
                      <option value="">Toda la Empresa</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.code}>
                          {cc.code} - {cc.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showEmployees}
                        onChange={(e) => setShowEmployees(e.target.checked)}
                        className="rounded border-gray-300 text-woden-primary focus:ring-woden-primary"
                      />
                      Empleados
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showVacant}
                        onChange={(e) => setShowVacant(e.target.checked)}
                        className="rounded border-gray-300 text-woden-primary focus:ring-woden-primary"
                      />
                      Vacantes
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showThirdParty}
                        onChange={(e) => setShowThirdParty(e.target.checked)}
                        className="rounded border-gray-300 text-woden-primary focus:ring-woden-primary"
                      />
                      Terceros
                    </label>
                  </div>
                </div>
              </div>

              {/* Monthly trend table */}
              <h3 className="text-md font-semibold text-gray-900 mb-3">
                Tendencia Mensual
              </h3>
              {monthlyTrend.length === 0 ? (
                <div className="card text-center text-gray-400">
                  No hay datos para mostrar
                </div>
              ) : (
                <div className="card overflow-x-auto p-0">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Mes</th>
                        <th className="table-header text-right">Altas</th>
                        <th className="table-header text-right">Bajas</th>
                        <th className="table-header text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyTrend.map((m) => {
                        let total = 0;
                        if (showEmployees) total += m.headcount;
                        if (showVacant) total += m.vacantPositions;
                        if (showThirdParty) total += m.thirdPartyCount;

                        return (
                          <tr
                            key={m.month}
                            className="hover:bg-woden-primary-lighter"
                          >
                            <td className="table-cell capitalize">
                              {m.monthLabel}
                            </td>
                            <td className="table-cell text-right">
                              {m.hires > 0 ? (
                                <span className="text-green-600 font-medium">
                                  +{m.hires}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="table-cell text-right">
                              {m.terminations > 0 ? (
                                <span className="text-red-600 font-medium">
                                  -{m.terminations}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="table-cell text-right font-medium">
                              {total}
                              {(showVacant || showThirdParty) && (
                                <span className="text-xs text-gray-400 ml-1">
                                  ({showEmployees ? m.headcount : 0}
                                  {showVacant ? `+${m.vacantPositions}v` : ""}
                                  {showThirdParty
                                    ? `+${m.thirdPartyCount}t`
                                    : ""}
                                  )
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Approval Modal */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {approvalModal.action === "approve"
                ? "Aprobar Solicitud"
                : approvalModal.action === "reject"
                ? "Rechazar Solicitud"
                : "Devolver Solicitud"}
            </h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-sm text-sm">
              <p>
                <strong>Tipo:</strong>{" "}
                {REQUEST_TYPE_LABELS[approvalModal.request.requestType]}
              </p>
              <p>
                <strong>Puesto:</strong>{" "}
                {approvalModal.request.positionTitle}
              </p>
              <p>
                <strong>Solicitante:</strong>{" "}
                {approvalModal.request.requestedByName}
              </p>
              <p>
                <strong>Justificación:</strong>{" "}
                {approvalModal.request.justification}
              </p>
            </div>
            <div className="mb-4">
              <label className="label-field">Comentarios</label>
              <textarea
                className="input-field"
                rows={3}
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                placeholder="Comentarios opcionales..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary"
                onClick={() => {
                  setApprovalModal(null);
                  setApprovalComments("");
                }}
              >
                Cancelar
              </button>
              <button
                className={
                  approvalModal.action === "reject"
                    ? "btn-danger"
                    : "btn-primary"
                }
                onClick={handleApproval}
                disabled={approvalLoading}
              >
                {approvalLoading
                  ? "Procesando..."
                  : approvalModal.action === "approve"
                  ? "Aprobar"
                  : approvalModal.action === "reject"
                  ? "Rechazar"
                  : "Devolver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
