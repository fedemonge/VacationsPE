"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface Period {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodType: string;
  status: string;
  paymentDate: string | null;
  calculatedAt: string | null;
  calculatedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
  employeeCount: number;
  totalNeto: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_BADGES: Record<string, string> = {
  ABIERTO: "bg-yellow-100 text-yellow-800",
  CALCULADO: "bg-blue-100 text-blue-800",
  CERRADO: "bg-green-100 text-green-800",
  ANULADO: "bg-red-100 text-red-800",
};

export default function PlanillaPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();

  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1);
  const [formPaymentDate, setFormPaymentDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planilla/periodos");
      if (res.ok) {
        const data = await res.json();
        setPeriods(Array.isArray(data) ? data : []);
        setError("");
      } else if (res.status === 403) {
        setError("No autorizado. Intente cerrar sesión y volver a ingresar.");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al cargar periodos");
      }
    } catch {
      setError("Error de conexión al cargar periodos");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla")) {
      loadPeriods();
    }
  }, [authenticated, hasAccess, loadPeriods]);

  if (authLoading) {
    return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  }

  if (!authenticated || !hasAccess("/planilla")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  async function handleCreate() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/planilla/periodos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodYear: formYear,
          periodMonth: formMonth,
          paymentDate: formPaymentDate || null,
          notes: formNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear periodo");
      } else {
        setSuccess(`Periodo ${MONTHS[formMonth - 1]} ${formYear} creado`);
        setShowForm(false);
        setFormNotes("");
        setFormPaymentDate("");
        loadPeriods();
      }
    } catch {
      setError("Error de conexión");
    }
    setSubmitting(false);
  }

  async function handleClose(id: string) {
    if (!confirm("¿Cerrar este periodo? Una vez cerrado no se podrá modificar.")) return;
    try {
      const res = await fetch(`/api/planilla/periodos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CERRAR" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cerrar");
      } else {
        setSuccess("Periodo cerrado");
        loadPeriods();
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este periodo y todos sus cálculos?")) return;
    try {
      const res = await fetch(`/api/planilla/periodos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al eliminar");
      } else {
        setSuccess("Periodo eliminado");
        loadPeriods();
      }
    } catch {
      setError("Error de conexión");
    }
  }

  const currentPeriod = periods.find((p) => p.status !== "CERRADO" && p.status !== "ANULADO");
  const totalNetoLast = periods.length > 0 ? periods[0].totalNeto : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Periodos de Planilla</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de periodos de nómina mensuales</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancelar" : "Nuevo Periodo"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">{success}</div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Periodos</p>
          <p className="text-2xl font-bold text-gray-900">{periods.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Periodo Actual</p>
          <p className="text-lg font-bold text-woden-primary">
            {currentPeriod
              ? `${MONTHS[currentPeriod.periodMonth - 1]} ${currentPeriod.periodYear}`
              : "Ninguno"}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Último Total Neto</p>
          <p className="text-2xl font-bold text-green-600">
            S/ {totalNetoLast.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Crear Nuevo Periodo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Año</label>
              <input type="number" className="input-field" value={formYear} onChange={(e) => setFormYear(parseInt(e.target.value) || 2026)} />
            </div>
            <div>
              <label className="label-field">Mes</label>
              <select className="input-field" value={formMonth} onChange={(e) => setFormMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Fecha de Pago</label>
              <input type="date" className="input-field" value={formPaymentDate} onChange={(e) => setFormPaymentDate(e.target.value)} />
            </div>
            <div>
              <label className="label-field">Notas</label>
              <input type="text" className="input-field" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="mt-4">
            <button onClick={handleCreate} disabled={submitting} className="btn-primary">
              {submitting ? "Creando..." : "Crear Periodo"}
            </button>
          </div>
        </div>
      )}

      {/* Periods Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
        ) : periods.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay periodos creados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Periodo</th>
                <th className="table-header">Tipo</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Empleados</th>
                <th className="table-header text-right">Total Neto</th>
                <th className="table-header">Fecha Pago</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-woden-primary-lighter">
                  <td className="table-cell font-medium">
                    <Link href={`/planilla/${p.id}`} className="text-woden-primary hover:underline">
                      {MONTHS[p.periodMonth - 1]} {p.periodYear}
                    </Link>
                  </td>
                  <td className="table-cell">{p.periodType}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_BADGES[p.status] || "bg-gray-100 text-gray-800"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="table-cell text-right">{p.employeeCount}</td>
                  <td className="table-cell text-right font-medium">
                    S/ {p.totalNeto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="table-cell text-gray-500">
                    {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("es-PE") : "-"}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <Link href={`/planilla/${p.id}`} className="text-woden-primary hover:underline text-xs">
                        Ver
                      </Link>
                      {p.status === "CALCULADO" && (
                        <button onClick={() => handleClose(p.id)} className="text-green-600 hover:underline text-xs">
                          Cerrar
                        </button>
                      )}
                      {p.status !== "CERRADO" && (
                        <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:underline text-xs">
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
