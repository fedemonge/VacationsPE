"use client";

import { useState, useEffect } from "react";

interface Solicitud {
  id: string;
  employeeName: string;
  employeeCode: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  status: string;
  currentApprovalLevel: number;
  createdAt: string;
  approvalRecords: {
    level: number;
    status: string;
    approverName: string;
    decidedAt: string | null;
  }[];
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
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    fetch("/api/solicitudes")
      .then((r) => r.json())
      .then((data) => setSolicitudes(data.solicitudes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterStatus
    ? solicitudes.filter((s) => s.status === filterStatus)
    : solicitudes;

  const highPriority = filtered.filter((s) =>
    isHighPriority(s.dateFrom, s.status)
  );
  const regular = filtered.filter(
    (s) => !isHighPriority(s.dateFrom, s.status)
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Panel de Aprobaciones
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Seguimiento en tiempo real del flujo de aprobación de solicitudes de
        vacaciones.
      </p>

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

      {/* High Priority Section */}
      {highPriority.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-woden-primary mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-woden-primary rounded-full animate-pulse" />
            Alta Prioridad — Próximas a vencer
          </h2>
          <div className="space-y-3">
            {highPriority.map((sol) => (
              <div
                key={sol.id}
                className="card border-l-4 border-l-woden-primary bg-woden-primary-lighter"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">
                      {sol.employeeName}{" "}
                      <span className="text-gray-400 text-xs">
                        ({sol.employeeCode})
                      </span>
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(sol.dateFrom).toLocaleDateString("es-PE")} -{" "}
                      {new Date(sol.dateTo).toLocaleDateString("es-PE")} ({sol.totalDays} días)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="badge-alta-prioridad">
                      {daysUntilStart(sol.dateFrom)} días para inicio
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {STATUS_LABELS[sol.status] || sol.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <th className="table-header">Solicitado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="table-cell text-center text-gray-400">
                  Cargando...
                </td>
              </tr>
            ) : regular.length === 0 && highPriority.length === 0 ? (
              <tr>
                <td colSpan={6} className="table-cell text-center text-gray-400">
                  No hay solicitudes
                </td>
              </tr>
            ) : (
              regular.map((sol) => (
                <tr key={sol.id} className="hover:bg-woden-primary-lighter">
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
                  <td className="table-cell text-sm text-gray-500">
                    {new Date(sol.createdAt).toLocaleDateString("es-PE")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
