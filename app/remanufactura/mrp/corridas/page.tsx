"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface MrpRun {
  id: string;
  name: string;
  startMonth: number;
  startYear: number;
  horizonMonths: number;
  status: string;
  notes: string | null;
  createdAt: string;
  _count?: { purchasePlans: number; productionPlans: number };
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function statusBadge(status: string) {
  switch (status) {
    case "APPROVED":
      return <span className="badge-aprobada">APROBADA</span>;
    case "ARCHIVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          ARCHIVADA
        </span>
      );
    default:
      return <span className="badge-pendiente">BORRADOR</span>;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
}

export default function CorridasMrpPage() {
  const { authenticated } = useAuth();
  const router = useRouter();
  const [runs, setRuns] = useState<MrpRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const now = new Date();
  const [nombre, setNombre] = useState(`Corrida MRP - ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`);
  const [mesInicio, setMesInicio] = useState(now.getMonth() + 1);
  const [anioInicio, setAnioInicio] = useState(now.getFullYear());
  const [horizonte, setHorizonte] = useState(12);
  const [notas, setNotas] = useState("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/remanufactura/mrp/run");
      if (res.ok) {
        const data = await res.json();
        setRuns(Array.isArray(data) ? data : data.runs || []);
      }
    } catch (e) {
      console.error("Error fetching runs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchRuns();
  }, [authenticated, fetchRuns]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/remanufactura/mrp/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nombre,
          startMonth: mesInicio,
          startYear: anioInicio,
          horizonMonths: horizonte,
          notes: notas || null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchRuns();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al crear la corrida MRP");
      }
    } catch (e) {
      console.error("Error creating run:", e);
      alert("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/remanufactura/mrp/run/${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteId(null);
        fetchRuns();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al eliminar");
      }
    } catch (e) {
      console.error("Error deleting run:", e);
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    const n = new Date();
    setNombre(`Corrida MRP - ${MONTH_NAMES[n.getMonth()]} ${n.getFullYear()}`);
    setMesInicio(n.getMonth() + 1);
    setAnioInicio(n.getFullYear());
    setHorizonte(12);
    setNotas("");
  };

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Debe iniciar sesion para acceder a esta pagina.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Corridas MRP</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Nueva Corrida
        </button>
      </div>

      {/* Runs table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Nombre</th>
                <th className="table-header">Fecha</th>
                <th className="table-header">Mes Inicio</th>
                <th className="table-header">Horizonte</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Lineas Compra</th>
                <th className="table-header text-right">Lineas Produccion</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-gray-400 py-12">
                    No hay corridas MRP. Cree una nueva corrida para comenzar.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/remanufactura/mrp/corridas/${run.id}`)}
                  >
                    <td className="table-cell font-medium text-gray-900">{run.name}</td>
                    <td className="table-cell">{formatDate(run.createdAt)}</td>
                    <td className="table-cell">
                      {MONTH_NAMES[run.startMonth - 1]} {run.startYear}
                    </td>
                    <td className="table-cell">{run.horizonMonths} meses</td>
                    <td className="table-cell">{statusBadge(run.status)}</td>
                    <td className="table-cell text-right">{(run as any).purchasePlanCount ?? run._count?.purchasePlans ?? "-"}</td>
                    <td className="table-cell text-right">{(run as any).productionPlanCount ?? run._count?.productionPlans ?? "-"}</td>
                    <td className="table-cell text-center">
                      <button
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(run.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Run Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nueva Corrida MRP</h2>
            <div className="space-y-4">
              <div>
                <label className="label-field">Nombre</label>
                <input
                  className="input-field"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">Mes Inicio</label>
                  <select
                    className="input-field"
                    value={mesInicio}
                    onChange={(e) => setMesInicio(Number(e.target.value))}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} - {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Ano Inicio</label>
                  <input
                    type="number"
                    className="input-field"
                    value={anioInicio}
                    onChange={(e) => setAnioInicio(Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="label-field">Meses Horizonte</label>
                <input
                  type="number"
                  className="input-field"
                  value={horizonte}
                  onChange={(e) => setHorizonte(Number(e.target.value))}
                  min={1}
                  max={36}
                />
              </div>
              <div>
                <label className="label-field">Notas (opcional)</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas adicionales sobre esta corrida..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleCreate}
                disabled={submitting || !nombre.trim()}
              >
                {submitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                Ejecutar MRP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-sm mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Confirmar Eliminacion</h2>
            <p className="text-sm text-gray-600 mb-6">
              Esta accion eliminara la corrida MRP y todos sus planes asociados. Esta accion no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setDeleteId(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className="btn-danger flex items-center gap-2" onClick={handleDelete} disabled={deleting}>
                {deleting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
