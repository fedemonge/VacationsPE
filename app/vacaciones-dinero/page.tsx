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

interface CashOutRequest {
  id: string;
  employeeName: string;
  employeeCode: string;
  daysRequested: number;
  status: string;
  createdAt: string;
}

interface CashOutPeriod {
  accrualYear: number;
  remaining: number;
  cashOutUsed: number;
  cashOutAvailable: number;
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

const MAX_PER_PERIOD = 15;

export default function VacacionesDineroPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [daysRequested, setDaysRequested] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cash-out availability info
  const [balance, setBalance] = useState<{
    totalAvailable: number;
    byPeriod: CashOutPeriod[];
  } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Existing requests
  const [requests, setRequests] = useState<CashOutRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => setError("Error al cargar empleados"));
    loadRequests();
  }, []);

  function loadRequests() {
    setRequestsLoading(true);
    fetch("/api/vacaciones-dinero")
      .then((r) => r.json())
      .then((data) => setRequests(data.cashOuts || []))
      .catch(() => {})
      .finally(() => setRequestsLoading(false));
  }

  async function loadBalance(employeeId: string) {
    setBalanceLoading(true);
    try {
      const res = await fetch(
        `/api/vacaciones-dinero?checkAvailability=true&employeeId=${employeeId}`
      );
      const data = await res.json();
      if (data.availability) {
        setBalance(data.availability);
      } else {
        setBalance({ totalAvailable: 0, byPeriod: [] });
      }
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }

  function handleEmployeeChange(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId) || null;
    setSelectedEmployee(emp);
    setBalance(null);
    if (emp) {
      loadBalance(emp.id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !daysRequested) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/vacaciones-dinero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          daysRequested,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear la solicitud");
      } else {
        setSuccess(`Solicitud de vacaciones en dinero creada. ID: ${data.id}`);
        setSelectedEmployee(null);
        setDaysRequested(1);
        setBalance(null);
        loadRequests();
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string): string {
    if (status === "APROBADA") return "badge-success";
    if (status === "RECHAZADA" || status === "CANCELADA") return "badge-error";
    return "badge-warning";
  }

  const isValid =
    selectedEmployee &&
    daysRequested >= 1 &&
    balance &&
    balance.totalAvailable >= daysRequested;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Vacaciones en Dinero
      </h1>
      <p className="text-gray-500 mb-8">
        Solicite el pago en dinero de hasta {MAX_PER_PERIOD} días por periodo de
        devengamiento. Los días solicitados se deducen del saldo de vacaciones
        disponible siguiendo el orden FIFO (periodo más antiguo primero).
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

        {/* Cash-out availability info */}
        {selectedEmployee && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-sm">
            {balanceLoading ? (
              <p className="text-sm text-blue-600">Consultando disponibilidad para pago en dinero...</p>
            ) : balance ? (
              <div>
                <p className="text-sm font-medium text-blue-800">
                  Total disponible para pago en dinero:{" "}
                  <span className="text-lg font-bold">
                    {balance.totalAvailable} días
                  </span>
                </p>
                {balance.byPeriod.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {balance.byPeriod
                      .filter((p) => p.remaining > 0)
                      .map((p) => (
                        <div
                          key={p.accrualYear}
                          className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-sm border border-blue-100"
                        >
                          <span className="font-medium text-blue-800">
                            Periodo {p.accrualYear}
                          </span>
                          <span className="text-blue-600">
                            Saldo: {p.remaining} días
                          </span>
                          <span className="text-blue-600">
                            En dinero: {p.cashOutUsed}/{MAX_PER_PERIOD} usados
                          </span>
                          <span
                            className={`font-bold ${
                              p.cashOutAvailable > 0
                                ? "text-green-600"
                                : "text-gray-400"
                            }`}
                          >
                            Disponible: {p.cashOutAvailable} días
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                {balance.totalAvailable < 1 && (
                  <p className="mt-2 text-sm text-red-600 font-medium">
                    No tiene saldo disponible para solicitar vacaciones en
                    dinero.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No se pudo consultar el saldo.
              </p>
            )}
          </div>
        )}

        {/* Days Requested */}
        <div>
          <label className="label-field">Días Solicitados</label>
          <input
            type="number"
            className="input-field"
            value={daysRequested}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              const max = balance ? balance.totalAvailable : MAX_PER_PERIOD;
              setDaysRequested(Math.min(Math.max(val, 0), max));
            }}
            min={1}
            max={balance ? balance.totalAvailable : MAX_PER_PERIOD}
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Máximo {MAX_PER_PERIOD} días por periodo de devengamiento. Los días
            se deducirán del saldo más antiguo (FIFO).
          </p>
        </div>

        {/* Summary */}
        {selectedEmployee && daysRequested >= 1 && (
          <div className="p-4 bg-woden-primary-light rounded-sm">
            <p className="text-sm font-medium text-gray-700">
              Días a pagar en dinero:{" "}
              <span className="text-woden-primary font-bold text-lg">
                {daysRequested}
              </span>{" "}
              días
            </p>
            {balance && daysRequested > balance.totalAvailable && (
              <p className="text-sm text-red-600 mt-1">
                Excede el saldo disponible ({balance.totalAvailable} días)
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || !isValid}
        >
          {loading
            ? "Enviando solicitud..."
            : "Enviar Solicitud de Vacaciones en Dinero"}
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
          No hay solicitudes de vacaciones en dinero registradas
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Empleado</th>
                <th className="table-header">Días</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Solicitado</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-woden-primary-lighter">
                  <td className="table-cell text-sm">
                    {req.employeeCode} - {req.employeeName}
                  </td>
                  <td className="table-cell text-sm text-center">
                    {req.daysRequested}
                  </td>
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
