"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface DetailLine {
  id: string;
  conceptCode: string;
  conceptName: string;
  category: string;
  amount: number;
  isAdjusted: boolean;
}

interface Detail {
  id: string;
  employeeId: string;
  baseSalary: number;
  daysWorked: number;
  pensionSystem: string;
  pensionProvider: string;
  totalIngresos: number;
  totalDescuentos: number;
  totalAportesEmpleador: number;
  netoAPagar: number;
  batchId: string | null;
  isExcluded: boolean;
  exclusionReason: string | null;
  excludedBy: string | null;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
    costCenter: string;
    costCenterDesc: string;
  };
  lines: DetailLine[];
}

interface PeriodData {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodType: string;
  status: string;
  paymentDate: string | null;
  notes: string | null;
  calculatedBy: string | null;
  closedBy: string | null;
  details: Detail[];
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

export default function PeriodDetailPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();
  const params = useParams();
  const router = useRouter();
  const periodId = params.periodId as string;

  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planilla/periodos/${periodId}`);
      if (res.ok) {
        setPeriod(await res.json());
      } else {
        setError("Periodo no encontrado");
      }
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  }, [periodId]);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla") && periodId) {
      loadPeriod();
    }
  }, [authenticated, hasAccess, periodId, loadPeriod]);

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Cargando...</div>;
  if (!period) return <div className="text-center py-12 text-red-500">{error || "No encontrado"}</div>;

  const totalIngresos = period.details.reduce((s, d) => s + d.totalIngresos, 0);
  const totalDescuentos = period.details.reduce((s, d) => s + d.totalDescuentos, 0);
  const totalAportes = period.details.reduce((s, d) => s + d.totalAportesEmpleador, 0);
  const totalNeto = period.details.reduce((s, d) => s + d.netoAPagar, 0);

  async function handleClose() {
    if (!confirm("¿Cerrar este periodo? Una vez cerrado no se podrá modificar.")) return;
    try {
      const res = await fetch(`/api/planilla/periodos/${periodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CERRAR" }),
      });
      if (res.ok) {
        setSuccess("Periodo cerrado");
        loadPeriod();
      } else {
        const data = await res.json();
        setError(data.error || "Error al cerrar");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleDeleteDetail(detailId: string) {
    if (!confirm("¿Eliminar este cálculo?")) return;
    try {
      const res = await fetch(`/api/planilla/detalle/${detailId}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Cálculo eliminado");
        loadPeriod();
      } else {
        const data = await res.json();
        setError(data.error || "Error al eliminar");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleExclude(detailId: string) {
    const reason = prompt("Ingrese la razón para excluir este registro del pago:");
    if (!reason) return;
    setError("");
    try {
      const res = await fetch(`/api/planilla/detalle/${detailId}/excluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setSuccess("Registro excluido del pago");
        loadPeriod();
      } else {
        const data = await res.json();
        setError(data.error || "Error al excluir");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleDownloadOdoo() {
    setError("");
    try {
      const res = await fetch(`/api/planilla/odoo-export/${periodId}`);
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="(.+)"/);
        const fileName = match ? match[1] : `Odoo_NOM_${periodId}.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setSuccess("Archivo Odoo descargado");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al generar archivo Odoo");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function handleCreateBatch() {
    if (!confirm("¿Crear un lote de pago con todos los registros no excluidos?")) return;
    setError("");
    try {
      const res = await fetch("/api/planilla/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (res.ok) {
        setSuccess("Lote de pago creado. Vaya a Lotes de Pago para gestionarlo.");
        loadPeriod();
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear lote");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/planilla" className="text-sm text-woden-primary hover:underline">&larr; Volver a Periodos</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {MONTHS[period.periodMonth - 1]} {period.periodYear}
            <span className={`ml-3 px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_BADGES[period.status]}`}>
              {period.status}
            </span>
          </h1>
          {period.notes && <p className="text-sm text-gray-500 mt-1">{period.notes}</p>}
        </div>
        <div className="flex gap-2">
          {period.status !== "CERRADO" && (
            <Link
              href={`/planilla/calcular`}
              className="btn-primary text-sm"
            >
              Agregar Empleado
            </Link>
          )}
          {(period.status === "CALCULADO" || period.status === "CERRADO") && period.details.length > 0 && (
            <button onClick={handleDownloadOdoo} className="btn-secondary text-sm">
              Exportar Odoo
            </button>
          )}
          {period.status === "CALCULADO" && (
            <>
              <button onClick={handleCreateBatch} className="btn-primary text-sm">
                Crear Lote de Pago
              </button>
              <button onClick={handleClose} className="btn-secondary text-sm">
                Cerrar Periodo
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">{error}</div>}
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">{success}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Empleados</p>
          <p className="text-2xl font-bold text-gray-900">{period.details.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Ingresos</p>
          <p className="text-lg font-bold text-green-600">S/ {totalIngresos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Descuentos</p>
          <p className="text-lg font-bold text-red-600">S/ {totalDescuentos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Aportes Empleador</p>
          <p className="text-lg font-bold text-blue-600">S/ {totalAportes.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center border-2 border-woden-primary">
          <p className="text-xs text-gray-500">Total Neto</p>
          <p className="text-lg font-bold text-woden-primary">S/ {totalNeto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Employee Details Table */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Empleado</h2>
        {period.details.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No hay cálculos. Use &quot;Agregar Empleado&quot; para calcular la planilla.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Código</th>
                <th className="table-header">Nombre</th>
                <th className="table-header">C. Costo</th>
                <th className="table-header text-right">Sueldo Base</th>
                <th className="table-header text-right">Días</th>
                <th className="table-header text-right">Ingresos</th>
                <th className="table-header text-right">Descuentos</th>
                <th className="table-header text-right">Aportes</th>
                <th className="table-header text-right">Neto</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {period.details.map((d) => {
                const hasAdj = d.lines.some((l) => l.isAdjusted);
                const isExcluded = d.isExcluded;
                return (
                  <tr
                    key={d.id}
                    className={`border-b border-gray-100 ${
                      isExcluded
                        ? "bg-gray-100 opacity-60 line-through"
                        : hasAdj
                        ? "bg-amber-50 hover:bg-woden-primary-lighter"
                        : "hover:bg-woden-primary-lighter"
                    }`}
                  >
                    <td className="table-cell">{d.employee.employeeCode}</td>
                    <td className="table-cell font-medium">
                      <Link href={`/planilla/${periodId}/${d.employeeId}`} className="text-woden-primary hover:underline no-underline">
                        {d.employee.fullName}
                      </Link>
                      {hasAdj && !isExcluded && <span className="ml-1 text-amber-500 text-xs" title="Tiene ajustes manuales">*</span>}
                      {isExcluded && (
                        <span className="ml-1 text-red-500 text-xs" title={d.exclusionReason || "Excluido"}>
                          (excluido)
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-gray-500">{d.employee.costCenter}</td>
                    <td className="table-cell text-right">S/ {d.baseSalary.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>
                    <td className="table-cell text-right">{d.daysWorked}</td>
                    <td className="table-cell text-right text-green-700">S/ {d.totalIngresos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>
                    <td className="table-cell text-right text-red-700">S/ {d.totalDescuentos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>
                    <td className="table-cell text-right text-blue-700">S/ {d.totalAportesEmpleador.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>
                    <td className="table-cell text-right font-bold">S/ {d.netoAPagar.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <Link href={`/planilla/${periodId}/${d.employeeId}`} className="text-woden-primary hover:underline text-xs">
                          Detalle
                        </Link>
                        {period.status !== "CERRADO" && !isExcluded && (
                          <>
                            <button onClick={() => handleExclude(d.id)} className="text-amber-600 hover:underline text-xs">
                              Excluir
                            </button>
                            <button onClick={() => handleDeleteDetail(d.id)} className="text-red-500 hover:underline text-xs">
                              Eliminar
                            </button>
                          </>
                        )}
                        {isExcluded && d.exclusionReason && (
                          <span className="text-xs text-gray-400" title={d.exclusionReason}>
                            {d.exclusionReason.length > 20 ? d.exclusionReason.substring(0, 20) + "..." : d.exclusionReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
