"use client";

import { useState, useEffect, useRef } from "react";

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  hireDate: string;
  terminationDate: string | null;
  costCenter: string;
  supervisorName: string;
  supervisorEmail: string;
  position: string;
}

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    employeeCode: "",
    fullName: "",
    email: "",
    hireDate: "",
    terminationDate: "",
    costCenter: "",
    supervisorName: "",
    supervisorEmail: "",
    position: "",
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const res = await fetch("/api/empleados");
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch {
      setError("Error al cargar empleados");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        ...form,
        terminationDate: form.terminationDate || null,
      };
      const res = await fetch("/api/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear empleado");
      } else {
        setSuccess(`Empleado ${data.fullName} creado exitosamente.`);
        setForm({
          employeeCode: "",
          fullName: "",
          email: "",
          hireDate: "",
          terminationDate: "",
          costCenter: "",
          supervisorName: "",
          supervisorEmail: "",
          position: "",
        });
        setShowForm(false);
        loadEmployees();
      }
    } catch {
      setError("Error de conexión al servidor");
    }
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/empleados/importar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al importar CSV");
      } else {
        setSuccess(`${data.imported} empleados importados exitosamente. ${data.errors} errores.`);
        loadEmployees();
      }
    } catch {
      setError("Error al subir el archivo");
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-gray-500 text-sm">
            Gestión de la población de empleados
          </p>
        </div>
        <div className="flex gap-3">
          <label className="btn-secondary cursor-pointer">
            {csvUploading ? "Importando..." : "Importar CSV"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSVUpload}
              disabled={csvUploading}
            />
          </label>
          <button
            className="btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancelar" : "+ Nuevo Empleado"}
          </button>
        </div>
      </div>

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

      {/* New Employee Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Nuevo Empleado
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Código de Empleado</label>
              <input
                type="text"
                className="input-field"
                value={form.employeeCode}
                onChange={(e) =>
                  setForm({ ...form, employeeCode: e.target.value })
                }
                placeholder="EMP-006"
                required
              />
            </div>
            <div>
              <label className="label-field">Nombre Completo</label>
              <input
                type="text"
                className="input-field"
                value={form.fullName}
                onChange={(e) =>
                  setForm({ ...form, fullName: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label-field">Email</label>
              <input
                type="email"
                className="input-field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label-field">Fecha de Ingreso</label>
              <input
                type="date"
                className="input-field"
                value={form.hireDate}
                onChange={(e) =>
                  setForm({ ...form, hireDate: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label-field">Fecha de Cese</label>
              <input
                type="date"
                className="input-field"
                value={form.terminationDate}
                onChange={(e) =>
                  setForm({ ...form, terminationDate: e.target.value })
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                Dejar vacío si el empleado está activo.
              </p>
            </div>
            <div>
              <label className="label-field">Centro de Costos</label>
              <input
                type="text"
                className="input-field"
                value={form.costCenter}
                onChange={(e) =>
                  setForm({ ...form, costCenter: e.target.value })
                }
                placeholder="CC-100"
                required
              />
            </div>
            <div>
              <label className="label-field">Cargo</label>
              <input
                type="text"
                className="input-field"
                value={form.position}
                onChange={(e) =>
                  setForm({ ...form, position: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label-field">Nombre del Supervisor</label>
              <input
                type="text"
                className="input-field"
                value={form.supervisorName}
                onChange={(e) =>
                  setForm({ ...form, supervisorName: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label-field">Email del Supervisor</label>
              <input
                type="email"
                className="input-field"
                value={form.supervisorEmail}
                onChange={(e) =>
                  setForm({ ...form, supervisorEmail: e.target.value })
                }
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-primary">
            Crear Empleado
          </button>
        </form>
      )}

      {/* Employee Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Código</th>
              <th className="table-header">Nombre</th>
              <th className="table-header">Email</th>
              <th className="table-header">Centro de Costos</th>
              <th className="table-header">Fecha Ingreso</th>
              <th className="table-header">Fecha Cese</th>
              <th className="table-header">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="table-cell text-center text-gray-400">
                  Cargando...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-cell text-center text-gray-400">
                  No hay empleados registrados
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-woden-primary-lighter">
                  <td className="table-cell font-mono text-xs">
                    {emp.employeeCode}
                  </td>
                  <td className="table-cell font-medium">{emp.fullName}</td>
                  <td className="table-cell text-gray-500">{emp.email}</td>
                  <td className="table-cell">{emp.costCenter}</td>
                  <td className="table-cell">
                    {new Date(emp.hireDate).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-cell text-gray-500">
                    {emp.terminationDate
                      ? new Date(emp.terminationDate).toLocaleDateString("es-PE")
                      : "—"}
                  </td>
                  <td className="table-cell">
                    {emp.terminationDate ? (
                      <span className="badge-rechazada">Inactivo</span>
                    ) : (
                      <span className="badge-aprobada">Activo</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CSV Format Info */}
      <div className="mt-6 p-4 bg-woden-primary-lighter rounded-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Formato CSV para importación
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          employeeCode,fullName,email,hireDate,terminationDate,costCenter,supervisorName,supervisorEmail,position
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Las fechas deben estar en formato YYYY-MM-DD. La primera fila se toma
          como encabezado.
        </p>
      </div>
    </div>
  );
}
