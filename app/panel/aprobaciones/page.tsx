"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

interface ApprovalRecord {
  level: number;
  status: string;
  approverName: string;
  approverEmail: string;
  decidedAt: string | null;
  comments: string | null;
}

interface Solicitud {
  id: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  supervisorName: string;
  supervisorEmail: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  status: string;
  currentApprovalLevel: number;
  createdAt: string;
  approvalRecords: ApprovalRecord[];
  requestType: "VACACIONES" | "RETORNO_ANTICIPADO" | "VACACIONES_DINERO" | "NUEVA_POSICION" | "CONTRATACION";
  returnDate?: string;
  daysRequested?: number;
  positionTitle?: string;
  justification?: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  NIVEL_1_PENDIENTE: "Nivel 1 - Supervisor",
  NIVEL_2_PENDIENTE: "Nivel 2 - RRHH",
  NIVEL_3_PENDIENTE: "Nivel 3 - Gerente General",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

const LEVEL_LABELS: Record<number, string> = {
  1: "Supervisor",
  2: "RRHH",
  3: "Gerente General",
};

function getStatusBadgeClass(status: string): string {
  if (status === "APROBADA") return "badge-aprobada";
  if (status === "RECHAZADA" || status === "CANCELADA") return "badge-rechazada";
  return "badge-pendiente";
}

function daysUntilStart(dateFrom: string): number {
  return Math.ceil(
    (new Date(dateFrom).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

function isHighPriority(dateFrom: string, status: string): boolean {
  if (status === "APROBADA" || status === "RECHAZADA" || status === "CANCELADA")
    return false;
  const days = daysUntilStart(dateFrom);
  return days <= 10 && days > 0;
}

export default function AprobacionesPage() {
  const { email, role } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState<"" | "VACACIONES" | "RETORNO_ANTICIPADO" | "VACACIONES_DINERO" | "NUEVA_POSICION" | "CONTRATACION">("");
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Approval modal state
  const [modalSolicitud, setModalSolicitud] = useState<Solicitud | null>(null);
  const [modalDecision, setModalDecision] = useState<"APROBADO" | "RECHAZADO" | "DEVUELTO">("APROBADO");
  const [modalComments, setModalComments] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);

  useEffect(() => {
    loadSolicitudes();
  }, []);

  async function loadSolicitudes() {
    setLoading(true);
    try {
      // Fetch vacation requests, early returns, cash-out requests, and staff requests
      const [vacRes, retRes, cashRes, staffRes] = await Promise.all([
        fetch("/api/solicitudes").then((r) => r.json()),
        fetch("/api/retorno-anticipado").then((r) => r.json()),
        fetch("/api/vacaciones-dinero").then((r) => r.json()),
        fetch("/api/solicitudes-personal").then((r) => r.json()),
      ]);

      const vacaciones: Solicitud[] = (vacRes.solicitudes || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          ...s,
          requestType: "VACACIONES" as const,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retornos: Solicitud[] = (retRes.retornos || []).map((r: any) => ({
        id: r.id,
        employeeName: r.employee?.fullName || "",
        employeeCode: r.employee?.employeeCode || "",
        employeeEmail: r.employee?.email || "",
        supervisorName: r.employee?.supervisorName || "",
        supervisorEmail: r.employee?.supervisorEmail || "",
        dateFrom: r.vacationRequest?.dateFrom || "",
        dateTo: r.vacationRequest?.dateTo || "",
        totalDays: r.vacationRequest?.totalDays || 0,
        status: r.status,
        currentApprovalLevel: r.currentApprovalLevel,
        createdAt: r.createdAt,
        approvalRecords: r.approvalRecords || [],
        requestType: "RETORNO_ANTICIPADO" as const,
        returnDate: r.returnDate,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashOuts: Solicitud[] = (cashRes.cashOuts || []).map((c: any) => ({
        id: c.id,
        employeeName: c.employeeName,
        employeeCode: c.employeeCode,
        employeeEmail: c.employeeEmail,
        supervisorName: c.supervisorName,
        supervisorEmail: c.supervisorEmail,
        dateFrom: c.createdAt,
        dateTo: c.createdAt,
        totalDays: c.daysRequested,
        status: c.status,
        currentApprovalLevel: c.currentApprovalLevel,
        createdAt: c.createdAt,
        approvalRecords: c.approvalRecords || [],
        requestType: "VACACIONES_DINERO" as const,
        daysRequested: c.daysRequested,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const staffRequests: Solicitud[] = (staffRes.solicitudes || []).map((s: any) => ({
        id: s.id,
        employeeName: s.requestedByName,
        employeeCode: "",
        employeeEmail: s.requestedByEmail,
        supervisorName: s.supervisorName,
        supervisorEmail: s.supervisorEmail,
        dateFrom: s.createdAt,
        dateTo: s.createdAt,
        totalDays: 0,
        status: s.status,
        currentApprovalLevel: s.currentApprovalLevel,
        createdAt: s.createdAt,
        approvalRecords: s.approvalRecords || [],
        requestType: s.requestType as "NUEVA_POSICION" | "CONTRATACION",
        positionTitle: s.positionTitle,
        justification: s.justification,
      }));

      setSolicitudes([...vacaciones, ...retornos, ...cashOuts, ...staffRequests]);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }

  function isSupervisorMatch(sol: Solicitud): boolean {
    if (!email) return false;
    const e = email.toLowerCase();
    // Check both fields since supervisorName may contain an email
    if (sol.supervisorEmail && sol.supervisorEmail.toLowerCase() === e) return true;
    if (sol.supervisorName && sol.supervisorName.toLowerCase() === e) return true;
    return false;
  }

  function canApproveAtLevel(sol: Solicitud): boolean {
    const level = sol.currentApprovalLevel;
    if (!level || level < 1 || level > 3) return false;

    const expectedStatus = `NIVEL_${level}_PENDIENTE`;
    if (sol.status !== expectedStatus) return false;

    if (level === 1) {
      if (role === "ADMINISTRADOR") return true;
      if (isSupervisorMatch(sol)) return true;
      return false;
    }
    if (level === 2) {
      return role === "ADMINISTRADOR" || role === "RRHH";
    }
    if (level === 3) {
      return role === "ADMINISTRADOR" || role === "GERENTE_PAIS";
    }
    return false;
  }

  function canReturnLevel(sol: Solicitud): boolean {
    if (sol.currentApprovalLevel <= 1) return false;
    const expectedStatus = `NIVEL_${sol.currentApprovalLevel}_PENDIENTE`;
    if (sol.status !== expectedStatus) return false;
    // Only the approver at the current level or admin can return
    if (role === "ADMINISTRADOR") return true;
    if (sol.currentApprovalLevel === 2 && role === "RRHH") return true;
    if (sol.currentApprovalLevel === 3 && role === "GERENTE_PAIS") return true;
    return false;
  }

  function isRelevantToUser(sol: Solicitud): boolean {
    if (!email) return false;
    // Admin, RRHH, and GERENTE_PAIS see all requests
    if (role === "ADMINISTRADOR" || role === "RRHH" || role === "GERENTE_PAIS") return true;

    const e = email.toLowerCase();

    // User is the requestor
    if (sol.employeeEmail?.toLowerCase() === e) return true;

    // User is the supervisor (check both fields since data may be swapped)
    if (sol.supervisorEmail?.toLowerCase() === e) return true;
    if (sol.supervisorName?.toLowerCase() === e) return true;

    // User appeared as approver in approval records
    if (sol.approvalRecords?.some((r) => r.approverEmail?.toLowerCase() === e)) return true;

    return false;
  }

  function openModal(sol: Solicitud, decision: "APROBADO" | "RECHAZADO" | "DEVUELTO") {
    setModalSolicitud(sol);
    setModalDecision(decision);
    setModalComments("");
    setActionMessage(null);
  }

  function closeModal() {
    setModalSolicitud(null);
    setModalComments("");
  }

  async function handleDecision() {
    if (!modalSolicitud) return;
    setModalSubmitting(true);
    setActionMessage(null);

    try {
      const url = modalDecision === "DEVUELTO"
        ? "/api/aprobaciones/devolver"
        : "/api/aprobaciones/decidir";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: modalSolicitud.id,
          decision: modalDecision,
          comments: modalComments || null,
          requestType: modalSolicitud.requestType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionMessage({ type: "error", text: data.error });
      } else {
        setActionMessage({ type: "success", text: data.message });
        closeModal();
        loadSolicitudes();
      }
    } catch {
      setActionMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setModalSubmitting(false);
    }
  }

  const userRelevant = solicitudes.filter(isRelevantToUser);

  let filtered = userRelevant;
  if (filterType) {
    filtered = filtered.filter((s) => s.requestType === filterType);
  }
  if (filterStatus) {
    filtered = filterStatus === "PENDIENTE"
      ? filtered.filter((s) => s.status.includes("PENDIENTE"))
      : filtered.filter((s) => s.status === filterStatus);
  }

  const highPriority = filtered.filter((s) =>
    isHighPriority(s.dateFrom, s.status)
  );
  const regular = filtered.filter(
    (s) => !isHighPriority(s.dateFrom, s.status)
  );
  const allSorted = [...highPriority, ...regular];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Panel de Aprobaciones
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Seguimiento en tiempo real del flujo de aprobación de solicitudes de
        vacaciones, retornos anticipados y vacaciones en dinero.
      </p>

      {actionMessage && (
        <div
          className={`mb-4 p-3 rounded-sm text-sm ${
            actionMessage.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Type Filter */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="text-sm text-gray-500">Tipo:</span>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            !filterType
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("")}
        >
          Todas
        </button>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            filterType === "VACACIONES"
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("VACACIONES")}
        >
          Vacaciones
        </button>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            filterType === "RETORNO_ANTICIPADO"
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("RETORNO_ANTICIPADO")}
        >
          Retorno Anticipado
        </button>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            filterType === "VACACIONES_DINERO"
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("VACACIONES_DINERO")}
        >
          Vac. en Dinero
        </button>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            filterType === "NUEVA_POSICION"
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("NUEVA_POSICION")}
        >
          Nueva Posición
        </button>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            filterType === "CONTRATACION"
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterType("CONTRATACION")}
        >
          Contratación
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            !filterStatus
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterStatus("")}
        >
          Todas
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1 text-sm rounded-sm border ${
              filterStatus === key
                ? "bg-woden-primary text-white border-woden-primary"
                : "border-gray-300 text-gray-600 hover:border-woden-primary"
            }`}
            onClick={() => setFilterStatus(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* All Requests Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Tipo</th>
              <th className="table-header">Empleado</th>
              <th className="table-header">Periodo</th>
              <th className="table-header">Días</th>
              <th className="table-header">Estado</th>
              <th className="table-header">Nivel</th>
              <th className="table-header">Solicitado</th>
              <th className="table-header">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="table-cell text-center text-gray-400">
                  Cargando...
                </td>
              </tr>
            ) : allSorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-cell text-center text-gray-400">
                  No hay solicitudes
                </td>
              </tr>
            ) : (
              allSorted.map((sol) => (
                <tr
                  key={`${sol.requestType}-${sol.id}`}
                  className={`hover:bg-woden-primary-lighter ${
                    isHighPriority(sol.dateFrom, sol.status) ? "bg-orange-50" : ""
                  }`}
                >
                  <td className="table-cell">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        sol.requestType === "RETORNO_ANTICIPADO"
                          ? "bg-purple-100 text-purple-700"
                          : sol.requestType === "VACACIONES_DINERO"
                          ? "bg-green-100 text-green-700"
                          : sol.requestType === "NUEVA_POSICION"
                          ? "bg-teal-100 text-teal-700"
                          : sol.requestType === "CONTRATACION"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {sol.requestType === "RETORNO_ANTICIPADO"
                        ? "Retorno"
                        : sol.requestType === "VACACIONES_DINERO"
                        ? "Dinero"
                        : sol.requestType === "NUEVA_POSICION"
                        ? "Nva. Posición"
                        : sol.requestType === "CONTRATACION"
                        ? "Contratación"
                        : "Vacaciones"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <p className="font-medium">{sol.employeeName}</p>
                    <p className="text-xs text-gray-400">{sol.employeeCode}</p>
                  </td>
                  <td className="table-cell text-sm">
                    {(sol.requestType === "NUEVA_POSICION" || sol.requestType === "CONTRATACION") ? (
                      <>
                        <span className="font-medium">{sol.positionTitle}</span>
                        <br />
                        <span className="text-xs text-gray-400 line-clamp-1">
                          {sol.justification}
                        </span>
                      </>
                    ) : sol.requestType === "VACACIONES_DINERO" ? (
                      <span className="text-green-600 font-medium">
                        {sol.daysRequested || sol.totalDays} días en dinero
                      </span>
                    ) : sol.requestType === "RETORNO_ANTICIPADO" && sol.returnDate ? (
                      <>
                        <span className="text-purple-600 font-medium">
                          Retorno: {new Date(sol.returnDate).toLocaleDateString("es-PE")}
                        </span>
                        <br />
                        <span className="text-xs text-gray-400">
                          Vac: {new Date(sol.dateFrom).toLocaleDateString("es-PE")} -{" "}
                          {new Date(sol.dateTo).toLocaleDateString("es-PE")}
                        </span>
                      </>
                    ) : (
                      <>
                        {new Date(sol.dateFrom).toLocaleDateString("es-PE")} -{" "}
                        {new Date(sol.dateTo).toLocaleDateString("es-PE")}
                      </>
                    )}
                  </td>
                  <td className="table-cell text-center">{sol.totalDays}</td>
                  <td className="table-cell">
                    <span className={getStatusBadgeClass(sol.status)}>
                      {STATUS_LABELS[sol.status] || sol.status}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    {sol.currentApprovalLevel > 0
                      ? `${sol.currentApprovalLevel}/3`
                      : "-"}
                  </td>
                  <td className="table-cell text-sm text-gray-500">
                    {new Date(sol.createdAt).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-cell">
                    {canApproveAtLevel(sol) || canReturnLevel(sol) ? (
                      <div className="flex gap-1 flex-wrap">
                        {canApproveAtLevel(sol) && (
                          <>
                            <button
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded-sm hover:bg-green-700"
                              onClick={() => openModal(sol, "APROBADO")}
                            >
                              Aprobar
                            </button>
                            <button
                              className="text-xs bg-red-500 text-white px-2 py-1 rounded-sm hover:bg-red-600"
                              onClick={() => openModal(sol, "RECHAZADO")}
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {canReturnLevel(sol) && (
                          <button
                            className="text-xs bg-yellow-500 text-white px-2 py-1 rounded-sm hover:bg-yellow-600"
                            onClick={() => openModal(sol, "DEVUELTO")}
                          >
                            Devolver
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Approval History */}
      {userRelevant.some((s) => s.approvalRecords.length > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Historial de Aprobaciones
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Tipo</th>
                  <th className="table-header">Empleado</th>
                  <th className="table-header">Nivel</th>
                  <th className="table-header">Aprobador</th>
                  <th className="table-header">Decisión</th>
                  <th className="table-header">Comentarios</th>
                  <th className="table-header">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {userRelevant
                  .flatMap((s) =>
                    s.approvalRecords
                      .filter((r) => r.decidedAt)
                      .map((r) => ({
                        ...r,
                        employeeName: s.employeeName,
                        requestType: s.requestType,
                      }))
                  )
                  .sort(
                    (a, b) =>
                      new Date(b.decidedAt!).getTime() -
                      new Date(a.decidedAt!).getTime()
                  )
                  .slice(0, 20)
                  .map((r, i) => (
                    <tr key={i} className="hover:bg-woden-primary-lighter">
                      <td className="table-cell">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            r.requestType === "RETORNO_ANTICIPADO"
                              ? "bg-purple-100 text-purple-700"
                              : r.requestType === "VACACIONES_DINERO"
                              ? "bg-green-100 text-green-700"
                              : r.requestType === "NUEVA_POSICION"
                              ? "bg-teal-100 text-teal-700"
                              : r.requestType === "CONTRATACION"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {r.requestType === "RETORNO_ANTICIPADO"
                            ? "Retorno"
                            : r.requestType === "VACACIONES_DINERO"
                            ? "Dinero"
                            : r.requestType === "NUEVA_POSICION"
                            ? "Nva. Pos."
                            : r.requestType === "CONTRATACION"
                            ? "Contrat."
                            : "Vac."}
                        </span>
                      </td>
                      <td className="table-cell text-sm">{r.employeeName}</td>
                      <td className="table-cell text-sm">
                        {LEVEL_LABELS[r.level] || `Nivel ${r.level}`}
                      </td>
                      <td className="table-cell text-sm">{r.approverName}</td>
                      <td className="table-cell">
                        <span
                          className={
                            r.status === "APROBADO"
                              ? "badge-aprobada"
                              : r.status === "DEVUELTO"
                                ? "badge-pendiente"
                                : "badge-rechazada"
                          }
                        >
                          {r.status === "APROBADO" ? "Aprobado" : r.status === "DEVUELTO" ? "Devuelto" : "Rechazado"}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">
                        {r.comments || "—"}
                      </td>
                      <td className="table-cell text-sm text-gray-500">
                        {new Date(r.decidedAt!).toLocaleString("es-PE")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval/Rejection Modal */}
      {modalSolicitud && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-sm shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {modalDecision === "APROBADO"
                ? modalSolicitud.requestType === "RETORNO_ANTICIPADO"
                  ? "Aprobar Retorno Anticipado"
                  : modalSolicitud.requestType === "VACACIONES_DINERO"
                  ? "Aprobar Vacaciones en Dinero"
                  : "Aprobar Solicitud"
                : modalDecision === "DEVUELTO"
                  ? "Devolver al Nivel Anterior"
                  : modalSolicitud.requestType === "RETORNO_ANTICIPADO"
                    ? "Rechazar Retorno Anticipado"
                    : modalSolicitud.requestType === "VACACIONES_DINERO"
                    ? "Rechazar Vacaciones en Dinero"
                    : "Rechazar Solicitud"}
            </h3>

            <div className="mb-4 p-3 bg-gray-50 rounded-sm text-sm space-y-1">
              <p>
                <span className="text-gray-500">Tipo:</span>{" "}
                <span className="font-medium">
                  {modalSolicitud.requestType === "RETORNO_ANTICIPADO"
                    ? "Retorno Anticipado"
                    : modalSolicitud.requestType === "VACACIONES_DINERO"
                    ? "Vacaciones en Dinero"
                    : "Vacaciones"}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Empleado:</span>{" "}
                <span className="font-medium">{modalSolicitud.employeeName}</span>
              </p>
              {modalSolicitud.requestType === "RETORNO_ANTICIPADO" && modalSolicitud.returnDate && (
                <p>
                  <span className="text-gray-500">Fecha de retorno:</span>{" "}
                  {new Date(modalSolicitud.returnDate).toLocaleDateString("es-PE")}
                </p>
              )}
              {modalSolicitud.requestType === "VACACIONES_DINERO" ? (
                <p>
                  <span className="text-gray-500">Días a pagar:</span>{" "}
                  {modalSolicitud.daysRequested || modalSolicitud.totalDays} días en dinero
                </p>
              ) : (
                <>
                  <p>
                    <span className="text-gray-500">Periodo vacaciones:</span>{" "}
                    {new Date(modalSolicitud.dateFrom).toLocaleDateString("es-PE")} -{" "}
                    {new Date(modalSolicitud.dateTo).toLocaleDateString("es-PE")}
                  </p>
                  <p>
                    <span className="text-gray-500">Días:</span>{" "}
                    {modalSolicitud.totalDays}
                  </p>
                </>
              )}
              <p>
                <span className="text-gray-500">Nivel actual:</span>{" "}
                {LEVEL_LABELS[modalSolicitud.currentApprovalLevel] ||
                  `Nivel ${modalSolicitud.currentApprovalLevel}`}
              </p>
            </div>

            <div className="mb-4">
              <label className="label-field">
                Comentarios {modalDecision !== "APROBADO" && "(recomendado)"}
              </label>
              <textarea
                className="input-field"
                rows={3}
                value={modalComments}
                onChange={(e) => setModalComments(e.target.value)}
                placeholder={
                  modalDecision === "APROBADO"
                    ? "Comentarios opcionales..."
                    : modalDecision === "DEVUELTO"
                      ? "Motivo de la devolución..."
                      : "Motivo del rechazo..."
                }
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-sm"
                onClick={closeModal}
                disabled={modalSubmitting}
              >
                Cancelar
              </button>
              <button
                className={`px-4 py-2 text-sm text-white rounded-sm ${
                  modalDecision === "APROBADO"
                    ? "bg-green-600 hover:bg-green-700"
                    : modalDecision === "DEVUELTO"
                      ? "bg-yellow-500 hover:bg-yellow-600"
                      : "bg-red-500 hover:bg-red-600"
                }`}
                onClick={handleDecision}
                disabled={modalSubmitting}
              >
                {modalSubmitting
                  ? "Procesando..."
                  : modalDecision === "APROBADO"
                    ? "Confirmar Aprobación"
                    : modalDecision === "DEVUELTO"
                      ? "Confirmar Devolución"
                      : "Confirmar Rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
