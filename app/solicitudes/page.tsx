"use client";

import { useState, useEffect } from "react";

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  supervisorName: string;
  supervisorEmail: string;
}

interface VacationRequest {
  id: string;
  employeeName: string;
  employeeCode: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  status: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  NIVEL_1_PENDIENTE: "Nivel 1 Pendiente",
  NIVEL_2_PENDIENTE: "Nivel 2 Pendiente",
  NIVEL_3_PENDIENTE: "Nivel 3 Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

export default function SolicitudesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Existing requests
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const minDate = getMinDate();

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => setError("Error al cargar empleados"));
    loadRequests();
  }, []);

  function loadRequests() {
    setRequestsLoading(true);
    fetch("/api/solicitudes")
      .then((r) => r.json())
      .then((data) => setRequests(data.solicitudes || []))
      .catch(() => {})
      .finally(() => setRequestsLoading(false));
  }

  function getMinDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }

  function handleEmployeeChange(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId) || null;
    setSelectedEmployee(emp);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !dateFrom || !dateTo) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          dateFrom,
          dateTo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear la solicitud");
      } else {
        setSuccess(`Solicitud creada exitosamente. ID: ${data.id}`);
        setSelectedEmployee(null);
        setDateFrom("");
        setDateTo("");
        loadRequests();
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw(requestId: string) {
    if (
      !confirm(
        "¿Está seguro de retirar esta solicitud? El saldo de vacaciones será restaurado."
      )
    )
      return;

    setWithdrawing(requestId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/solicitudes/retirar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          reason: "Retirada voluntaria por el solicitante",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al retirar la solicitud");
      } else {
        setSuccess(data.message);
        loadRequests();
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setWithdrawing(null);
    }
  }

  function canWithdraw(req: VacationRequest): boolean {
    if (["CANCELADA", "RECHAZADA"].includes(req.status)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(req.dateFrom);
    startDate.setHours(0, 0, 0, 0);
    return startDate > today;
  }

  function getStatusBadge(status: string): string {
    if (status === "APROBADA") return "badge-success";
    if (status === "RECHAZADA" || status === "CANCELADA") return "badge-error";
    return "badge-warning";
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Solicitud de Vacaciones
      </h1>
      <p className="text-gray-500 mb-8">
        Las vacaciones deben solicitarse con al menos 30 días de anticipación.
      </p>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6 mb-8">
        {/* Employee Selector */}
        <div>
          <label className="label-field">Empleado</label>
          <select
            className="input-field"
            value={selectedEmployee?.id || ""}
            onChange={(e) => handleEmployeeChange(e.target.value)}
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

        {/* Auto-filled fields */}
        {selectedEmployee && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-woden-primary-lighter rounded-sm">
            <div>
              <label className="label-field">Nombre del Empleado</label>
              <input
                type="text"
                className="input-field bg-white"
                value={selectedEmployee.fullName}
                disabled
              />
            </div>
            <div>
              <label className="label-field">Código de Empleado</label>
              <input
                type="text"
                className="input-field bg-white"
                value={selectedEmployee.employeeCode}
                disabled
              />
            </div>
            <div>
              <label className="label-field">Email del Empleado</label>
              <input
                type="email"
                className="input-field bg-white"
                value={selectedEmployee.email}
                disabled
              />
            </div>
            <div>
              <label className="label-field">Nombre del Supervisor</label>
              <input
                type="text"
                className="input-field bg-white"
                value={selectedEmployee.supervisorName}
                disabled
              />
            </div>
            <div className="md:col-span-2">
              <label className="label-field">Email del Supervisor</label>
              <input
                type="email"
                className="input-field bg-white"
                value={selectedEmployee.supervisorEmail}
                disabled
              />
            </div>
          </div>
        )}

        {/* Date Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-field">Fecha Desde</label>
            <input
              type="date"
              className="input-field"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              min={minDate}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Mínimo: {new Date(minDate).toLocaleDateString("es-PE")}
            </p>
          </div>
          <div>
            <label className="label-field">Fecha Hasta</label>
            <input
              type="date"
              className="input-field"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || minDate}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              El día siguiente es el día de retorno a oficina.
            </p>
          </div>
        </div>

        {/* Days summary */}
        {dateFrom && dateTo && new Date(dateTo) >= new Date(dateFrom) && (
          <div className="p-4 bg-woden-primary-light rounded-sm">
            <p className="text-sm font-medium text-gray-700">
              Días solicitados:{" "}
              <span className="text-woden-primary font-bold text-lg">
                {Math.ceil(
                  (new Date(dateTo).getTime() -
                    new Date(dateFrom).getTime()) /
                    (1000 * 60 * 60 * 24) +
                    1
                )}
              </span>{" "}
              días calendario
            </p>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || !selectedEmployee || !dateFrom || !dateTo}
        >
          {loading ? "Enviando solicitud..." : "Enviar Solicitud de Vacaciones"}
        </button>
      </form>

      {/* Existing Requests */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Solicitudes Existentes
      </h2>

      {requestsLoading ? (
        <div className="card text-center text-gray-400">Cargando...</div>
      ) : requests.length === 0 ? (
        <div className="card text-center text-gray-400">
          No hay solicitudes registradas
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Empleado</th>
                <th className="table-header">Periodo</th>
                <th className="table-header">Días</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Solicitado</th>
                <th className="table-header">Acción</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-woden-primary-lighter">
                  <td className="table-cell text-sm">
                    {req.employeeCode} - {req.employeeName}
                  </td>
                  <td className="table-cell text-sm">
                    {new Date(req.dateFrom).toLocaleDateString("es-PE")} -{" "}
                    {new Date(req.dateTo).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-cell text-sm text-center">
                    {req.totalDays}
                  </td>
                  <td className="table-cell">
                    <span className={getStatusBadge(req.status)}>
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {new Date(req.createdAt).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-cell">
                    {canWithdraw(req) ? (
                      <button
                        className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
                        onClick={() => handleWithdraw(req.id)}
                        disabled={withdrawing === req.id}
                      >
                        {withdrawing === req.id ? "Retirando..." : "Retirar"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
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
