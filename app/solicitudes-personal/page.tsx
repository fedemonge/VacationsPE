"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

interface VacantPosition {
  id: string;
  positionCode: string;
  title: string;
  costCenter: string;
  costCenterDesc: string;
  reportsToEmail: string;
  positionType: string;
}

interface CostCenter {
  id: string;
  code: string;
  description: string;
}

interface StaffRequestItem {
  id: string;
  requestType: string;
  positionTitle: string;
  costCenter: string;
  costCenterDesc: string;
  reportsToEmail: string;
  positionType: string;
  justification: string;
  requestedByEmail: string;
  requestedByName: string;
  status: string;
  currentApprovalLevel: number;
  createdAt: string;
  approvedAt: string | null;
  hiredAt: string | null;
}

interface Employee {
  id: string;
  fullName: string;
  email: string;
  position: string;
  terminationDate: string | null;
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

export default function SolicitudesPersonalPage() {
  const { authenticated, email } = useAuth();
  const [requestType, setRequestType] = useState<"NUEVA_POSICION" | "CONTRATACION">("NUEVA_POSICION");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form fields
  const [positionId, setPositionId] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [costCenterDesc, setCostCenterDesc] = useState("");
  const [reportsToEmail, setReportsToEmail] = useState("");
  const [positionType, setPositionType] = useState("REGULAR");
  const [justification, setJustification] = useState("");

  // Data
  const [vacantPositions, setVacantPositions] = useState<VacantPosition[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myRequests, setMyRequests] = useState<StaffRequestItem[]>([]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [posRes, ccRes, empRes, reqRes] = await Promise.all([
        fetch("/api/posiciones?status=VACANTE"),
        fetch("/api/centros-costos"),
        fetch("/api/empleados"),
        fetch("/api/solicitudes-personal"),
      ]);

      const posData = await posRes.json();
      const ccData = await ccRes.json();
      const empData = await empRes.json();
      const reqData = await reqRes.json();

      setVacantPositions(posData.posiciones || []);
      setCostCenters(ccData.centros || []);
      setEmployees(
        (empData.empleados || []).filter(
          (e: Employee) => !e.terminationDate
        )
      );
      setMyRequests(reqData.solicitudes || []);
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated, loadData]);

  function handlePositionSelect(id: string) {
    setPositionId(id);
    const pos = vacantPositions.find((p) => p.id === id);
    if (pos) {
      setPositionTitle(pos.title);
      setCostCenter(pos.costCenter);
      setCostCenterDesc(pos.costCenterDesc);
      setReportsToEmail(pos.reportsToEmail);
      setPositionType(pos.positionType);
    }
  }

  function handleCostCenterSelect(code: string) {
    setCostCenter(code);
    const cc = costCenters.find((c) => c.code === code);
    setCostCenterDesc(cc?.description || "");
  }

  function resetForm() {
    setPositionId("");
    setPositionTitle("");
    setCostCenter("");
    setCostCenterDesc("");
    setReportsToEmail("");
    setPositionType("REGULAR");
    setJustification("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/solicitudes-personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          positionId: requestType === "CONTRATACION" ? positionId : null,
          positionTitle,
          costCenter,
          costCenterDesc,
          reportsToEmail,
          positionType,
          justification,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({
          type: "success",
          text: `Solicitud de ${REQUEST_TYPE_LABELS[requestType].toLowerCase()} creada exitosamente`,
        });
        resetForm();
        loadData();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Solicitud de Personal
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Solicite una nueva posición o contratación para una vacante existente
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

      {/* Request type toggle */}
      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
            requestType === "NUEVA_POSICION"
              ? "bg-woden-primary text-white"
              : "border border-gray-300 text-gray-600 hover:border-woden-primary hover:text-woden-primary"
          }`}
          onClick={() => {
            setRequestType("NUEVA_POSICION");
            resetForm();
          }}
        >
          Nueva Posición
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
            requestType === "CONTRATACION"
              ? "bg-woden-primary text-white"
              : "border border-gray-300 text-gray-600 hover:border-woden-primary hover:text-woden-primary"
          }`}
          onClick={() => {
            setRequestType("CONTRATACION");
            resetForm();
          }}
        >
          Contratación (Vacante Existente)
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-4 mb-8">
        {requestType === "CONTRATACION" && (
          <div>
            <label className="label-field">Posición Vacante</label>
            <select
              className="input-field"
              value={positionId}
              onChange={(e) => handlePositionSelect(e.target.value)}
              required
            >
              <option value="">Seleccione una posición vacante</option>
              {vacantPositions.map((vp) => (
                <option key={vp.id} value={vp.id}>
                  {vp.positionCode} - {vp.title} ({vp.costCenter})
                </option>
              ))}
            </select>
            {vacantPositions.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                No hay posiciones vacantes disponibles
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-field">Título del Puesto</label>
            <input
              className="input-field"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              required
              disabled={requestType === "CONTRATACION" && !!positionId}
              placeholder="Ej: Analista de RRHH"
            />
          </div>

          <div>
            <label className="label-field">Centro de Costos</label>
            {requestType === "NUEVA_POSICION" ? (
              <select
                className="input-field"
                value={costCenter}
                onChange={(e) => handleCostCenterSelect(e.target.value)}
                required
              >
                <option value="">Seleccione</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.code}>
                    {cc.code} - {cc.description}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input-field"
                value={
                  costCenter
                    ? `${costCenter}${costCenterDesc ? ` - ${costCenterDesc}` : ""}`
                    : ""
                }
                disabled
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-field">Reporta a (Supervisor)</label>
            {requestType === "NUEVA_POSICION" ? (
              <select
                className="input-field"
                value={reportsToEmail}
                onChange={(e) => setReportsToEmail(e.target.value)}
                required
              >
                <option value="">Seleccione un supervisor</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.email}>
                    {emp.fullName} ({emp.email})
                  </option>
                ))}
              </select>
            ) : (
              <input className="input-field" value={reportsToEmail} disabled />
            )}
          </div>

          <div>
            <label className="label-field">Tipo de Posición</label>
            <select
              className="input-field"
              value={positionType}
              onChange={(e) => setPositionType(e.target.value)}
              disabled={requestType === "CONTRATACION" && !!positionId}
            >
              <option value="REGULAR">Regular (Planilla)</option>
              <option value="TERCERO">Tercero (Outsourcing)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label-field">Justificación</label>
          <textarea
            className="input-field"
            rows={4}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            required
            placeholder="Explique la necesidad de esta solicitud..."
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? "Enviando..." : "Enviar Solicitud"}
        </button>
      </form>

      {/* My requests table */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Mis Solicitudes de Personal
      </h2>
      {dataLoading ? (
        <div className="card text-center text-gray-400">Cargando...</div>
      ) : myRequests.length === 0 ? (
        <div className="card text-center text-gray-400">
          No hay solicitudes de personal registradas
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Tipo</th>
                <th className="table-header">Puesto</th>
                <th className="table-header">Centro Costo</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((req) => (
                <tr key={req.id} className="hover:bg-woden-primary-lighter">
                  <td className="table-cell">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        req.requestType === "NUEVA_POSICION"
                          ? "bg-teal-100 text-teal-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {REQUEST_TYPE_LABELS[req.requestType] || req.requestType}
                    </span>
                  </td>
                  <td className="table-cell">{req.positionTitle}</td>
                  <td className="table-cell">{req.costCenter}</td>
                  <td className="table-cell">
                    <span className={getStatusBadge(req.status)}>
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {new Date(req.createdAt).toLocaleDateString("es-PE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
