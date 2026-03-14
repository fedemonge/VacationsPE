"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface BatchDetail {
  id: string;
  employeeId: string;
  baseSalary: number;
  netoAPagar: number;
  isExcluded: boolean;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
    costCenter: string;
  };
}

interface Batch {
  id: string;
  periodId: string;
  batchNumber: number;
  status: string;
  totalEmployees: number;
  totalNeto: number;
  currentApprovalLevel: number;
  notes: string | null;
  bbvaFileName: string | null;
  bbvaFileGeneratedAt: string | null;
  createdAt: string;
  createdBy: string;
  period: {
    periodYear: number;
    periodMonth: number;
    periodType: string;
    status: string;
  };
  _count?: { details: number };
  details?: BatchDetail[];
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_BADGES: Record<string, string> = {
  BORRADOR: "bg-gray-100 text-gray-800",
  NIVEL_1_PENDIENTE: "bg-yellow-100 text-yellow-800",
  NIVEL_2_PENDIENTE: "bg-orange-100 text-orange-800",
  NIVEL_3_PENDIENTE: "bg-purple-100 text-purple-800",
  APROBADO: "bg-green-100 text-green-800",
  RECHAZADO: "bg-red-100 text-red-800",
  PAGADO: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  NIVEL_1_PENDIENTE: "Pend. RRHH",
  NIVEL_2_PENDIENTE: "Pend. Jefe Financiero",
  NIVEL_3_PENDIENTE: "Pend. Gerente General",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  PAGADO: "Pagado",
};

export default function BatchesPage() {
  const { authenticated, loading: authLoading, hasAccess, role, email } = useAuth();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planilla/batches");
      if (res.ok) setBatches(await res.json());
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla/batches")) {
      loadBatches();
    }
  }, [authenticated, hasAccess, loadBatches]);

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla/batches")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  async function loadBatchDetail(batchId: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/planilla/batches/${batchId}`);
      if (res.ok) setSelectedBatch(await res.json());
    } catch {
      // silent
    }
    setLoadingDetail(false);
  }

  async function handleAction(batchId: string, action: string) {
    if (action === "SUBMIT" && !confirm("¿Enviar este lote para aprobación?")) return;
    if (action === "REJECT" && !confirm("¿Rechazar este lote?")) return;
    if (action === "MARK_PAID" && !confirm("¿Marcar este lote como pagado?")) return;
    if (action === "DELETE" && !confirm("¿Eliminar este lote borrador?")) return;

    setError("");
    try {
      if (action === "DELETE") {
        const res = await fetch(`/api/planilla/batches/${batchId}`, { method: "DELETE" });
        if (res.ok) {
          setSuccess("Lote eliminado");
          setSelectedBatch(null);
          loadBatches();
        } else {
          const data = await res.json();
          setError(data.error || "Error");
        }
        return;
      }

      const res = await fetch(`/api/planilla/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comments: approvalComment || null }),
      });
      const data = await res.json();
      if (res.ok) {
        const actionLabels: Record<string, string> = {
          SUBMIT: "Lote enviado para aprobación",
          APPROVE: "Lote aprobado",
          REJECT: "Lote rechazado",
          MARK_PAID: "Lote marcado como pagado",
        };
        setSuccess(actionLabels[action] || "Acción completada");
        setApprovalComment("");
        loadBatches();
        if (selectedBatch) loadBatchDetail(batchId);
      } else {
        setError(data.error || "Error en la acción");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleDownloadBBVA(batchId: string) {
    try {
      const res = await fetch(`/api/planilla/batches/${batchId}/bbva`);
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="(.+)"/);
        const fileName = match ? match[1] : "BBVA_pago.txt";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setSuccess("Archivo BBVA descargado");
        loadBatches();
      } else {
        const data = await res.json();
        setError(data.error || "Error al generar archivo");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  function canApprove(batch: Batch): boolean {
    if (role === "ADMINISTRADOR") return true;
    if (batch.status === "NIVEL_1_PENDIENTE" && (role === "RRHH")) return true;
    // Level 2 and 3 are email-based, handled server-side
    if (["NIVEL_2_PENDIENTE", "NIVEL_3_PENDIENTE"].includes(batch.status)) return true;
    return false;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lotes de Pago</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestión de lotes para aprobación y generación de archivos de pago BBVA
        </p>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">{error}</div>}
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">{success}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Lotes</p>
          <p className="text-2xl font-bold text-gray-900">{batches.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Pendientes</p>
          <p className="text-2xl font-bold text-yellow-600">
            {batches.filter((b) => b.status.includes("PENDIENTE")).length}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Aprobados</p>
          <p className="text-2xl font-bold text-green-600">
            {batches.filter((b) => b.status === "APROBADO").length}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Pagados</p>
          <p className="text-2xl font-bold text-blue-600">
            {batches.filter((b) => b.status === "PAGADO").length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Batch list */}
        <div className="card overflow-x-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Lotes</h2>
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No hay lotes. Cree uno desde un <Link href="/planilla" className="text-woden-primary hover:underline">periodo</Link>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Periodo</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header text-right">Empl.</th>
                  <th className="table-header text-right">Total Neto</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className={`border-b border-gray-100 hover:bg-woden-primary-lighter cursor-pointer ${selectedBatch?.id === b.id ? "bg-woden-primary-lighter" : ""}`}
                    onClick={() => loadBatchDetail(b.id)}
                  >
                    <td className="table-cell font-medium">{b.batchNumber}</td>
                    <td className="table-cell text-xs">
                      {MONTHS[b.period.periodMonth - 1]} {b.period.periodYear}
                    </td>
                    <td className="table-cell">
                      <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_BADGES[b.status] || "bg-gray-100"}`}>
                        {STATUS_LABELS[b.status] || b.status}
                      </span>
                    </td>
                    <td className="table-cell text-right">{b.totalEmployees}</td>
                    <td className="table-cell text-right font-medium">
                      S/ {b.totalNeto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="table-cell">
                      <button onClick={(e) => { e.stopPropagation(); loadBatchDetail(b.id); }} className="text-woden-primary hover:underline text-xs">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Batch detail */}
        <div className="space-y-4">
          {loadingDetail && <p className="card text-sm text-gray-500 text-center py-8">Cargando detalle...</p>}

          {selectedBatch && !loadingDetail && (
            <>
              <div className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Lote #{selectedBatch.batchNumber}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {MONTHS[selectedBatch.period.periodMonth - 1]} {selectedBatch.period.periodYear}
                      {" "}&middot;{" "}
                      <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_BADGES[selectedBatch.status]}`}>
                        {STATUS_LABELS[selectedBatch.status] || selectedBatch.status}
                      </span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p>Creado: {new Date(selectedBatch.createdAt).toLocaleString("es-PE")}</p>
                    <p>Por: {selectedBatch.createdBy}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-2 bg-gray-50 rounded-sm text-center">
                    <p className="text-xs text-gray-500">Empleados</p>
                    <p className="text-lg font-bold text-gray-900">{selectedBatch.totalEmployees}</p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-sm text-center">
                    <p className="text-xs text-gray-500">Total Neto</p>
                    <p className="text-lg font-bold text-woden-primary">
                      S/ {selectedBatch.totalNeto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {selectedBatch.notes && (
                  <p className="text-sm text-gray-600 mb-3">Notas: {selectedBatch.notes}</p>
                )}

                {selectedBatch.bbvaFileName && (
                  <p className="text-xs text-gray-500 mb-3">
                    Archivo BBVA: {selectedBatch.bbvaFileName}
                    {selectedBatch.bbvaFileGeneratedAt && (
                      <span> ({new Date(selectedBatch.bbvaFileGeneratedAt).toLocaleString("es-PE")})</span>
                    )}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {selectedBatch.status === "BORRADOR" && (
                    <>
                      <button onClick={() => handleAction(selectedBatch.id, "SUBMIT")} className="btn-primary text-sm">
                        Enviar para Aprobación
                      </button>
                      <button onClick={() => handleAction(selectedBatch.id, "DELETE")} className="text-red-500 hover:underline text-sm">
                        Eliminar
                      </button>
                    </>
                  )}

                  {selectedBatch.status.includes("PENDIENTE") && canApprove(selectedBatch) && (
                    <div className="w-full space-y-2">
                      <input
                        type="text"
                        placeholder="Comentarios (opcional)"
                        className="input-field w-full text-sm"
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleAction(selectedBatch.id, "APPROVE")} className="btn-primary text-sm">
                          Aprobar (Nivel {selectedBatch.currentApprovalLevel})
                        </button>
                        <button onClick={() => handleAction(selectedBatch.id, "REJECT")} className="text-red-500 hover:underline text-sm">
                          Rechazar
                        </button>
                      </div>
                    </div>
                  )}

                  {["APROBADO", "PAGADO"].includes(selectedBatch.status) && (
                    <button onClick={() => handleDownloadBBVA(selectedBatch.id)} className="btn-primary text-sm">
                      Descargar Archivo BBVA
                    </button>
                  )}

                  {selectedBatch.status === "APROBADO" && (
                    <button onClick={() => handleAction(selectedBatch.id, "MARK_PAID")} className="btn-secondary text-sm">
                      Marcar como Pagado
                    </button>
                  )}
                </div>
              </div>

              {/* Employees in batch */}
              {selectedBatch.details && selectedBatch.details.length > 0 && (
                <div className="card overflow-x-auto">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Empleados en el Lote ({selectedBatch.details.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header">Código</th>
                        <th className="table-header">Nombre</th>
                        <th className="table-header">C. Costo</th>
                        <th className="table-header text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatch.details.map((d) => (
                        <tr key={d.id} className="border-b border-gray-100">
                          <td className="table-cell">{d.employee.employeeCode}</td>
                          <td className="table-cell font-medium">{d.employee.fullName}</td>
                          <td className="table-cell text-gray-500">{d.employee.costCenter}</td>
                          <td className="table-cell text-right font-medium">
                            S/ {d.netoAPagar.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!selectedBatch && !loadingDetail && (
            <div className="card text-center py-12 text-gray-400">
              <p>Seleccione un lote para ver su detalle</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
