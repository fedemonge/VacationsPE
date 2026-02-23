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
}

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  NIVEL_1_PENDIENTE: "Nivel 1 - Supervisor",
  NIVEL_2_PENDIENTE: "Nivel 2 - RRHH",
  NIVEL_3_PENDIENTE: "Nivel 3 - Gerente País",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

const LEVEL_LABELS: Record<number, string> = {
  1: "Supervisor",
  2: "RRHH",
  3: "Gerente País",
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
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Approval modal state
  const [modalSolicitud, setModalSolicitud] = useState<Solicitud | null>(null);
  const [modalDecision, setModalDecision] = useState<"APROBADO" | "RECHAZADO">("APROBADO");
  const [modalComments, setModalComments] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);

  useEffect(() => {
    loadSolicitudes();
  }, []);

  function loadSolicitudes() {
    setLoading(true);
    fetch("/api/solicitudes")
      .then((r) => r.json())
      .then((data) => setSolicitudes(data.solicitudes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function canApproveAtLevel(sol: Solicitud): boolean {
    const level = sol.currentApprovalLevel;
    if (!level || level < 1 || level > 3) return false;

    const expectedStatus = `NIVEL_${level}_PENDIENTE`;
    if (sol.status !== expectedStatus) return false;

    if (level === 1) {
      if (role === "ADMINISTRADOR") return true;
      if (email === sol.supervisorEmail) return true;
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

  function openModal(sol: Solicitud, decision: "APROBADO" | "RECHAZADO") {
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
      const res = await fetch("/api/aprobaciones/decidir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: modalSolicitud.id,
          decision: modalDecision,
          comments: modalComments || null,
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

  const filtered = filterStatus
    ? solicitudes.filter((s) => s.status === filterStatus)
    : solicitudes;

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
        vacaciones.
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

      {/* Filters */}
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
              <th className="table-header">Empleado</th>
              <th className="table-header">Periodo</th>
              <th className="table-header">Días</th>
              <th className="table-header">Estado</th>
              <th className="table-header">Nivel</th>
              <th className="table-header">Supervisor</th>
              <th className="table-header">Solicitado</th>
              <th className="table-header w-36">Acciones</th>
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
                  key={sol.id}
                  className={`hover:bg-woden-primary-lighter ${
                    isHighPriority(sol.dateFrom, sol.status) ? "bg-orange-50" : ""
                  }`}
                >
                  <td className="table-cell">
                    <p className="font-medium">{sol.employeeName}</p>
                    <p className="text-xs text-gray-400">{sol.employeeCode}</p>
                  </td>
                  <td className="table-cell text-sm">
                    {new Date(sol.dateFrom).toLocaleDateString("es-PE")} -{" "}
                    {new Date(sol.dateTo).toLocaleDateString("es-PE")}
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
                  <td className="table-cell text-xs text-gray-500">
                    {sol.supervisorName}
                  </td>
                  <td className="table-cell text-sm text-gray-500">
                    {new Date(sol.createdAt).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-cell">
                    {canApproveAtLevel(sol) ? (
                      <div className="flex gap-1">
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
      {solicitudes.some((s) => s.approvalRecords.length > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Historial de Aprobaciones
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Empleado</th>
                  <th className="table-header">Nivel</th>
                  <th className="table-header">Aprobador</th>
                  <th className="table-header">Decisión</th>
                  <th className="table-header">Comentarios</th>
                  <th className="table-header">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes
                  .flatMap((s) =>
                    s.approvalRecords
                      .filter((r) => r.decidedAt)
                      .map((r) => ({ ...r, employeeName: s.employeeName }))
                  )
                  .sort(
                    (a, b) =>
                      new Date(b.decidedAt!).getTime() -
                      new Date(a.decidedAt!).getTime()
                  )
                  .slice(0, 20)
                  .map((r, i) => (
                    <tr key={i} className="hover:bg-woden-primary-lighter">
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
                              : "badge-rechazada"
                          }
                        >
                          {r.status === "APROBADO" ? "Aprobado" : "Rechazado"}
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
                ? "Aprobar Solicitud"
                : "Rechazar Solicitud"}
            </h3>

            <div className="mb-4 p-3 bg-gray-50 rounded-sm text-sm space-y-1">
              <p>
                <span className="text-gray-500">Empleado:</span>{" "}
                <span className="font-medium">{modalSolicitud.employeeName}</span>
              </p>
              <p>
                <span className="text-gray-500">Periodo:</span>{" "}
                {new Date(modalSolicitud.dateFrom).toLocaleDateString("es-PE")} -{" "}
                {new Date(modalSolicitud.dateTo).toLocaleDateString("es-PE")}
              </p>
              <p>
                <span className="text-gray-500">Días:</span>{" "}
                {modalSolicitud.totalDays}
              </p>
              <p>
                <span className="text-gray-500">Nivel actual:</span>{" "}
                {LEVEL_LABELS[modalSolicitud.currentApprovalLevel] ||
                  `Nivel ${modalSolicitud.currentApprovalLevel}`}
              </p>
            </div>

            <div className="mb-4">
              <label className="label-field">
                Comentarios {modalDecision === "RECHAZADO" && "(recomendado)"}
              </label>
              <textarea
                className="input-field"
                rows={3}
                value={modalComments}
                onChange={(e) => setModalComments(e.target.value)}
                placeholder={
                  modalDecision === "APROBADO"
                    ? "Comentarios opcionales..."
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
                    : "bg-red-500 hover:bg-red-600"
                }`}
                onClick={handleDecision}
                disabled={modalSubmitting}
              >
                {modalSubmitting
                  ? "Procesando..."
                  : modalDecision === "APROBADO"
                    ? "Confirmar Aprobación"
                    : "Confirmar Rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
