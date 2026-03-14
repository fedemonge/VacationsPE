"use client";

import { useState, useEffect, useRef } from "react";

interface Shift {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  effectiveHours: number;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  hireDate: string;
  terminationDate: string | null;
  costCenter: string;
  costCenterDesc: string;
  supervisorName: string;
  supervisorEmail: string;
  position: string;
  // Payroll fields
  documentType: string;
  documentNumber: string | null;
  birthDate: string | null;
  gender: string | null;
  contractType: string;
  contractStart: string | null;
  contractEnd: string | null;
  baseSalary: number;
  pensionSystem: string;
  pensionProvider: string | null;
  hasDependents: boolean;
  has5taCatExemption: boolean;
  bankName: string | null;
  bankAccountNumber: string | null;
  shiftId: string | null;
  shift: Shift | null;
}

const EMPTY_FORM = {
  employeeCode: "",
  fullName: "",
  email: "",
  hireDate: "",
  terminationDate: "",
  costCenter: "",
  costCenterDesc: "",
  supervisorName: "",
  supervisorEmail: "",
  position: "",
  // Payroll fields
  documentType: "DNI",
  documentNumber: "",
  birthDate: "",
  gender: "",
  contractType: "INDEFINIDO",
  contractStart: "",
  contractEnd: "",
  baseSalary: "",
  pensionSystem: "AFP",
  pensionProvider: "",
  hasDependents: false,
  has5taCatExemption: false,
  bankName: "",
  bankAccountNumber: "",
  shiftId: "",
};

const CONTRACT_TYPES = ["INDEFINIDO", "PLAZO_FIJO", "PARCIAL", "FORMATIVO"];
const PENSION_SYSTEMS = ["AFP", "ONP"];
const AFP_PROVIDERS = ["HABITAT", "INTEGRA", "PRIMA", "PROFUTURO"];
const DOC_TYPES = ["DNI", "CE", "PASAPORTE"];

interface CostCenter {
  id: string;
  code: string;
  description: string;
}

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [sortColumn, setSortColumn] = useState<string>("fullName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const isEditing = editingId !== null;

  function isSelfSupervisorPosition(position: string): boolean {
    const p = position.toLowerCase().trim();
    return p === "gerente general" || p === "country manager";
  }

  useEffect(() => {
    loadEmployees();
    loadCostCenters();
    loadShifts();
  }, []);

  async function loadCostCenters() {
    try {
      const res = await fetch("/api/centros-costos");
      const data = await res.json();
      setCostCenters(data.costCenters || []);
    } catch {
      // ignore
    }
  }

  async function loadShifts() {
    try {
      const res = await fetch("/api/planilla/turnos");
      if (res.ok) setShifts(await res.json());
    } catch { /* ignore */ }
  }

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

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(emp: Employee) {
    setForm({
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      email: emp.email,
      hireDate: emp.hireDate.split("T")[0],
      terminationDate: emp.terminationDate ? emp.terminationDate.split("T")[0] : "",
      costCenter: emp.costCenter,
      costCenterDesc: emp.costCenterDesc || "",
      supervisorName: emp.supervisorName,
      supervisorEmail: emp.supervisorEmail,
      position: emp.position,
      // Payroll fields
      documentType: emp.documentType || "DNI",
      documentNumber: emp.documentNumber || "",
      birthDate: emp.birthDate ? emp.birthDate.split("T")[0] : "",
      gender: emp.gender || "",
      contractType: emp.contractType || "INDEFINIDO",
      contractStart: emp.contractStart ? emp.contractStart.split("T")[0] : "",
      contractEnd: emp.contractEnd ? emp.contractEnd.split("T")[0] : "",
      baseSalary: emp.baseSalary ? String(emp.baseSalary) : "",
      pensionSystem: emp.pensionSystem || "AFP",
      pensionProvider: emp.pensionProvider || "",
      hasDependents: emp.hasDependents || false,
      has5taCatExemption: emp.has5taCatExemption || false,
      bankName: emp.bankName || "",
      bankAccountNumber: emp.bankAccountNumber || "",
      shiftId: emp.shiftId || "",
    });
    setEditingId(emp.id);
    setShowForm(true);
    setError(null);
    setSuccess(null);
    // Scroll to form
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function handleNewEmployee() {
    if (showForm && !isEditing) {
      resetForm();
    } else {
      resetForm();
      setShowForm(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      ...form,
      terminationDate: form.terminationDate || null,
      documentNumber: form.documentNumber || null,
      birthDate: form.birthDate || null,
      gender: form.gender || null,
      contractStart: form.contractStart || null,
      contractEnd: form.contractEnd || null,
      baseSalary: form.baseSalary ? parseFloat(form.baseSalary as string) : 0,
      pensionProvider: form.pensionProvider || null,
      bankName: form.bankName || null,
      bankAccountNumber: form.bankAccountNumber || null,
      shiftId: form.shiftId || null,
    };

    try {
      if (isEditing) {
        // Update existing employee
        const res = await fetch(`/api/empleados/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Error al actualizar empleado");
        } else {
          setSuccess(`Empleado ${data.fullName} actualizado exitosamente.`);
          resetForm();
          loadEmployees();
        }
      } else {
        // Create new employee
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
          resetForm();
          loadEmployees();
        }
      }
    } catch {
      setError("Error de conexión al servidor");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
        setError(data.error || "Error al importar archivo");
      } else {
        const parts = [];
        if (data.imported > 0) parts.push(`${data.imported} nuevos`);
        if (data.updated > 0) parts.push(`${data.updated} actualizados`);
        if (data.errors > 0) parts.push(`${data.errors} errores`);
        setSuccess(`Importación completada: ${parts.join(", ")}.`);
        if (data.errorDetails && data.errorDetails.length > 0) {
          setError(`Errores: ${data.errorDetails.slice(0, 5).join("; ")}${data.errorDetails.length > 5 ? ` (+${data.errorDetails.length - 5} más)` : ""}`);
        }
        loadEmployees();
      }
    } catch {
      setError("Error al subir el archivo");
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function getSortedEmployees(): Employee[] {
    return [...employees].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";

      switch (sortColumn) {
        case "employeeCode":
          valA = a.employeeCode.toLowerCase();
          valB = b.employeeCode.toLowerCase();
          break;
        case "fullName":
          valA = a.fullName.toLowerCase();
          valB = b.fullName.toLowerCase();
          break;
        case "email":
          valA = a.email.toLowerCase();
          valB = b.email.toLowerCase();
          break;
        case "position":
          valA = a.position.toLowerCase();
          valB = b.position.toLowerCase();
          break;
        case "costCenter":
          valA = a.costCenter.toLowerCase();
          valB = b.costCenter.toLowerCase();
          break;
        case "hireDate":
          valA = new Date(a.hireDate).getTime();
          valB = new Date(b.hireDate).getTime();
          break;
        case "terminationDate":
          valA = a.terminationDate ? new Date(a.terminationDate).getTime() : 0;
          valB = b.terminationDate ? new Date(b.terminationDate).getTime() : 0;
          break;
        case "estado":
          valA = a.terminationDate ? 1 : 0;
          valB = b.terminationDate ? 1 : 0;
          break;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }

  const sortArrow = (column: string) =>
    sortColumn === column ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

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
            {csvUploading ? "Importando..." : "Importar Archivo"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
              disabled={csvUploading}
            />
          </label>
          <button className="btn-primary" onClick={handleNewEmployee}>
            {showForm && !isEditing ? "Cancelar" : "+ Nuevo Empleado"}
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

      {/* Create / Edit Employee Form */}
      {showForm && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={`card mb-6 space-y-4 ${isEditing ? "border-l-4 border-l-woden-primary" : ""}`}
        >
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? "Editar Empleado" : "Nuevo Empleado"}
            </h2>
            {isEditing && (
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-gray-600"
                onClick={resetForm}
              >
                Cancelar edición
              </button>
            )}
          </div>
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
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-xs text-gray-400 mt-1">
                  El código no se puede modificar.
                </p>
              )}
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
              {costCenters.length > 0 ? (
                <select
                  className="input-field"
                  value={form.costCenter}
                  onChange={(e) => {
                    const selected = costCenters.find((cc) => cc.code === e.target.value);
                    setForm({
                      ...form,
                      costCenter: e.target.value,
                      costCenterDesc: selected?.description || "",
                    });
                  }}
                  required
                >
                  <option value="">Seleccione un centro de costos...</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.code}>
                      {cc.code} - {cc.description}
                    </option>
                  ))}
                </select>
              ) : (
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
              )}
              {costCenters.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Configure centros de costos en Configuración para usar la lista desplegable.
                </p>
              )}
            </div>
            <div>
              <label className="label-field">Cargo</label>
              <input
                type="text"
                className="input-field"
                value={form.position}
                onChange={(e) => {
                  const newPosition = e.target.value;
                  if (isSelfSupervisorPosition(newPosition) && form.fullName && form.email) {
                    setForm({
                      ...form,
                      position: newPosition,
                      supervisorName: form.fullName,
                      supervisorEmail: form.email,
                    });
                  } else {
                    setForm({ ...form, position: newPosition });
                  }
                }}
                required
              />
              {isSelfSupervisorPosition(form.position) && (
                <p className="text-xs text-woden-primary mt-1">
                  El supervisor se asigna automáticamente como el mismo empleado.
                </p>
              )}
            </div>
            <div>
              <label className="label-field">Supervisor</label>
              {isSelfSupervisorPosition(form.position) ? (
                <input
                  type="text"
                  className="input-field bg-gray-50"
                  value={form.supervisorName ? `${form.supervisorName} (${form.supervisorEmail})` : "Se asignará automáticamente"}
                  disabled
                />
              ) : (
                <select
                  className="input-field"
                  value={form.supervisorEmail}
                  onChange={(e) => {
                    const sup = employees.find((emp) => emp.email === e.target.value);
                    setForm({
                      ...form,
                      supervisorName: sup?.fullName || "",
                      supervisorEmail: e.target.value,
                    });
                  }}
                  required
                >
                  <option value="">Seleccione un supervisor...</option>
                  {employees
                    .filter((emp) => emp.id !== editingId && !emp.terminationDate)
                    .map((emp) => (
                      <option key={emp.id} value={emp.email}>
                        {emp.fullName} ({emp.email})
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div>
              <label className="label-field">Email del Supervisor</label>
              <input
                type="email"
                className="input-field"
                value={form.supervisorEmail}
                disabled
              />
            </div>
          </div>

          {/* Payroll Data Section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Datos de Planilla</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">Tipo Documento</label>
                <select className="input-field" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-field">Nro. Documento</label>
                <input type="text" className="input-field" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} placeholder="12345678" />
              </div>
              <div>
                <label className="label-field">Fecha Nacimiento</label>
                <input type="date" className="input-field" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </div>
              <div>
                <label className="label-field">Género</label>
                <select className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
              <div>
                <label className="label-field">Tipo Contrato</label>
                <select className="input-field" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
                  {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-field">Fecha Inicio Contrato</label>
                <input type="date" className="input-field" value={form.contractStart} onChange={(e) => setForm({ ...form, contractStart: e.target.value })} />
              </div>
              <div>
                <label className="label-field">Fecha Fin Contrato</label>
                <input type="date" className="input-field" value={form.contractEnd} onChange={(e) => setForm({ ...form, contractEnd: e.target.value })} />
              </div>
              <div>
                <label className="label-field">Sueldo Base</label>
                <input type="number" step="0.01" min="0" className="input-field" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="label-field">Sistema Pensión</label>
                <select className="input-field" value={form.pensionSystem} onChange={(e) => setForm({ ...form, pensionSystem: e.target.value })}>
                  {PENSION_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {form.pensionSystem === "AFP" && (
                <div>
                  <label className="label-field">AFP</label>
                  <select className="input-field" value={form.pensionProvider} onChange={(e) => setForm({ ...form, pensionProvider: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {AFP_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label-field">Turno</label>
                <select className="input-field" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                  <option value="">Sin turno</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name} ({s.startTime}-{s.endTime})</option>)}
                </select>
              </div>
              <div>
                <label className="label-field">Banco</label>
                <input type="text" className="input-field" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="BBVA, BCP, Scotiabank..." />
              </div>
              <div>
                <label className="label-field">Nro. Cuenta</label>
                <input type="text" className="input-field" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.hasDependents === true} onChange={(e) => setForm({ ...form, hasDependents: e.target.checked })} className="accent-woden-primary" />
                  Dependientes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.has5taCatExemption === true} onChange={(e) => setForm({ ...form, has5taCatExemption: e.target.checked })} className="accent-woden-primary" />
                  Exonerado 5ta
                </label>
              </div>
            </div>
          </div>

          <button type="submit" className="btn-primary mt-4">
            {isEditing ? "Guardar Cambios" : "Crear Empleado"}
          </button>
        </form>
      )}

      {/* Employee Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("employeeCode")}>Código{sortArrow("employeeCode")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("fullName")}>Nombre{sortArrow("fullName")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("email")}>Email{sortArrow("email")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("position")}>Cargo{sortArrow("position")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("costCenter")}>Centro de Costos{sortArrow("costCenter")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("hireDate")}>Fecha Ingreso{sortArrow("hireDate")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("terminationDate")}>Fecha Cese{sortArrow("terminationDate")}</th>
              <th className="table-header cursor-pointer select-none hover:bg-woden-primary-hover" onClick={() => handleSort("estado")}>Estado{sortArrow("estado")}</th>
              <th className="table-header w-20">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="table-cell text-center text-gray-400">
                  Cargando...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-cell text-center text-gray-400">
                  No hay empleados registrados
                </td>
              </tr>
            ) : (
              getSortedEmployees().map((emp) => (
                <tr
                  key={emp.id}
                  className={`hover:bg-woden-primary-lighter ${
                    editingId === emp.id ? "bg-woden-primary-light" : ""
                  }`}
                >
                  <td className="table-cell font-mono text-xs">
                    {emp.employeeCode}
                  </td>
                  <td className="table-cell font-medium">{emp.fullName}</td>
                  <td className="table-cell text-gray-500">{emp.email}</td>
                  <td className="table-cell">{emp.position}</td>
                  <td className="table-cell">
                    {(() => {
                      const cc = costCenters.find((c) => c.code === emp.costCenter);
                      return cc
                        ? `${emp.costCenter} - ${cc.description}`
                        : emp.costCenterDesc
                          ? `${emp.costCenter} - ${emp.costCenterDesc}`
                          : emp.costCenter;
                    })()}
                  </td>
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
                  <td className="table-cell">
                    <button
                      className="text-xs text-woden-primary hover:underline font-medium"
                      onClick={() => handleEdit(emp)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Supervisor Assignment Section */}
      <SupervisorSection employees={employees} onUpdate={loadEmployees} />

      {/* Import Format Info */}
      <div className="mt-6 p-4 bg-woden-primary-lighter rounded-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Formatos de importación (CSV, TXT, XLSX)
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          El sistema detecta automáticamente las columnas por nombre de encabezado. Columnas soportadas:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
          <span><strong>ID</strong> → Código empleado</span>
          <span><strong>Nombre del empleado</strong> → Nombre completo</span>
          <span><strong>Correo electrónico de trabajo</strong> → Email</span>
          <span><strong>Primera fecha del contrato</strong> → Fecha ingreso</span>
          <span><strong>Fecha de salida</strong> → Fecha cese</span>
          <span><strong>Departamento</strong> → Centro de costo</span>
          <span><strong>Puesto de trabajo</strong> → Cargo</span>
          <span><strong>Gerente</strong> → Supervisor</span>
          <span><strong>Teléfono del trabajo</strong> → Teléfono</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          La primera fila se toma como encabezado. Las columnas faltantes se llenan con valores por defecto.
          TXT soporta delimitadores tab, pipe (|) y punto y coma (;).
        </p>
      </div>

      {/* Power Automate Info */}
      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Sincronización de Supervisores vía Power Automate (Office 365)
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          Configure un flujo de Power Automate que envíe un POST a{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
            /api/empleados/supervisores
          </code>{" "}
          con el header <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">x-webhook-secret</code> y el siguiente body:
        </p>
        <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
{`{
  "employees": [
    {
      "email": "empleado@empresa.com",
      "supervisorName": "Nombre del Supervisor",
      "supervisorEmail": "supervisor@empresa.com"
    }
  ]
}`}
        </pre>
        <p className="text-xs text-gray-400 mt-2">
          El flujo de Power Automate puede usar el conector de Office 365 Users
          para obtener el campo &quot;manager&quot; de cada usuario y enviarlo periódicamente.
        </p>
      </div>
    </div>
  );
}

function isSelfSupervisorPosition(position: string): boolean {
  const p = position.toLowerCase().trim();
  return p === "gerente general" || p === "country manager";
}

function SupervisorSection({
  employees,
  onUpdate,
}: {
  employees: Employee[];
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [supMessage, setSupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const isSelfSupervisor = selectedEmployee ? isSelfSupervisorPosition(selectedEmployee.position) : false;

  function handleSelectEmployee(empId: string) {
    setSelectedEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      if (isSelfSupervisorPosition(emp.position)) {
        setSupervisorName(emp.fullName);
        setSupervisorEmail(emp.email);
      } else {
        setSupervisorName(emp.supervisorName);
        setSupervisorEmail(emp.supervisorEmail);
      }
    } else {
      setSupervisorName("");
      setSupervisorEmail("");
    }
    setSupMessage(null);
  }

  async function handleSaveSupervisor(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    setSaving(true);
    setSupMessage(null);

    try {
      const res = await fetch("/api/empleados/supervisores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          supervisorName,
          supervisorEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSupMessage({ type: "error", text: data.error });
      } else {
        setSupMessage({ type: "success", text: data.message });
        onUpdate();
      }
    } catch {
      setSupMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-woden-primary mb-3"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Asignación de Supervisores
      </button>

      {expanded && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">
            Asigne o cambie el supervisor de un empleado. Esta información
            determina quién aprueba las solicitudes de vacaciones en Nivel 1.
          </p>

          {supMessage && (
            <div
              className={`p-3 rounded-sm text-sm ${
                supMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {supMessage.text}
            </div>
          )}

          <form onSubmit={handleSaveSupervisor} className="space-y-4">
            <div>
              <label className="label-field">Empleado</label>
              <select
                className="input-field"
                value={selectedEmployeeId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                required
              >
                <option value="">Seleccione un empleado...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode}) — Supervisor actual:{" "}
                    {emp.supervisorName}
                  </option>
                ))}
              </select>
            </div>

            {selectedEmployeeId && (
              <>
                {isSelfSupervisor && (
                  <div className="p-3 bg-woden-primary-lighter rounded-sm text-sm text-woden-primary">
                    El cargo de este empleado es <strong>{selectedEmployee?.position}</strong>. El supervisor se asigna automáticamente como el mismo empleado.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label-field">Supervisor</label>
                    {isSelfSupervisor ? (
                      <input
                        type="text"
                        className="input-field bg-gray-50"
                        value={`${supervisorName} (${supervisorEmail})`}
                        disabled
                      />
                    ) : (
                      <select
                        className="input-field"
                        value={supervisorEmail}
                        onChange={(e) => {
                          const sup = employees.find((emp) => emp.email === e.target.value);
                          setSupervisorName(sup?.fullName || "");
                          setSupervisorEmail(e.target.value);
                        }}
                        required
                      >
                        <option value="">Seleccione un supervisor...</option>
                        {employees
                          .filter((emp) => emp.id !== selectedEmployeeId && !emp.terminationDate)
                          .map((emp) => (
                            <option key={emp.id} value={emp.email}>
                              {emp.fullName} ({emp.email})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="label-field">Email del Supervisor</label>
                    <input
                      type="email"
                      className="input-field"
                      value={supervisorEmail}
                      disabled
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || !supervisorName || !supervisorEmail}
                >
                  {saving ? "Guardando..." : "Guardar Supervisor"}
                </button>
              </>
            )}
          </form>

          {/* Current supervisor assignments table */}
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Asignaciones actuales
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Empleado</th>
                    <th className="table-header">Supervisor</th>
                    <th className="table-header">Email Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-woden-primary-lighter">
                      <td className="table-cell text-sm">{emp.fullName}</td>
                      <td className="table-cell text-sm">{emp.supervisorName}</td>
                      <td className="table-cell text-sm text-gray-500">
                        {emp.supervisorEmail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
