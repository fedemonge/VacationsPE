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

export default function SolicitudesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minDate = getMinDate();

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => setError("Error al cargar empleados"));
  }, []);

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
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
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

      <form onSubmit={handleSubmit} className="card space-y-6">
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
                  (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) /
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
    </div>
  );
}
