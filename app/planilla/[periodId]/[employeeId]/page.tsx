"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useParams } from "next/navigation";
import Link from "next/link";

interface DetailLine {
  id: string;
  conceptCode: string;
  conceptName: string;
  category: string;
  amount: number;
  autoAmount: number | null;
  isAdjusted: boolean;
  adjustedBy: string | null;
  adjustmentReason: string | null;
  calcBase: number | null;
  calcRate: number | null;
  calcFormula: string | null;
}

interface DetailData {
  id: string;
  baseSalary: number;
  daysWorked: number;
  pensionSystem: string;
  pensionProvider: string;
  hasDependents: boolean;
  totalIngresos: number;
  totalDescuentos: number;
  totalAportesEmpleador: number;
  netoAPagar: number;
  inputSnapshot: string | null;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
    costCenter: string;
    costCenterDesc: string;
  };
  period: {
    periodYear: number;
    periodMonth: number;
    periodType: string;
    status: string;
  };
  lines: DetailLine[];
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const CATEGORY_LABELS: Record<string, string> = {
  INGRESO: "Ingresos",
  DESCUENTO: "Descuentos",
  APORTE_EMPLEADOR: "Aportes del Empleador",
  INFORMATIVO: "Informativo",
};

const CATEGORY_COLORS: Record<string, string> = {
  INGRESO: "bg-green-600",
  DESCUENTO: "bg-red-600",
  APORTE_EMPLEADOR: "bg-blue-600",
  INFORMATIVO: "bg-gray-500",
};

export default function EmployeePayrollDetailPage() {
  const { authenticated, loading: authLoading, hasAccess } = useAuth();
  const params = useParams();
  const periodId = params.periodId as string;
  const employeeId = params.employeeId as string;

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      // First get the period to find the detail ID
      const res = await fetch(`/api/planilla/periodos/${periodId}`);
      if (res.ok) {
        const periodData = await res.json();
        const empDetail = periodData.details?.find(
          (d: { employeeId: string }) => d.employeeId === employeeId
        );
        if (empDetail) {
          // Fetch full detail
          const detailRes = await fetch(`/api/planilla/detalle/${empDetail.id}`);
          if (detailRes.ok) {
            setDetail(await detailRes.json());
          }
        }
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [periodId, employeeId]);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla") && periodId && employeeId) {
      loadDetail();
    }
  }, [authenticated, hasAccess, periodId, employeeId, loadDetail]);

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Cargando...</div>;
  if (!detail) return <div className="text-center py-12 text-red-500">Detalle no encontrado</div>;

  const categories = ["INGRESO", "DESCUENTO", "APORTE_EMPLEADOR", "INFORMATIVO"];
  const hasAdjustments = detail.lines.some((l) => l.isAdjusted);

  let snapshot: Record<string, unknown> | null = null;
  if (detail.inputSnapshot) {
    try {
      snapshot = JSON.parse(detail.inputSnapshot);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/planilla/${periodId}`} className="text-sm text-woden-primary hover:underline">
          &larr; Volver al Periodo
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          {detail.employee.fullName}
        </h1>
        <p className="text-sm text-gray-500">
          {detail.employee.employeeCode} &middot; {detail.employee.email} &middot;{" "}
          {MONTHS[detail.period.periodMonth - 1]} {detail.period.periodYear}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Sueldo Base</p>
          <p className="text-lg font-bold text-gray-900">S/ {detail.baseSalary.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Días Trab.</p>
          <p className="text-lg font-bold text-gray-900">{detail.daysWorked}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Ingresos</p>
          <p className="text-lg font-bold text-green-600">S/ {detail.totalIngresos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Descuentos</p>
          <p className="text-lg font-bold text-red-600">S/ {detail.totalDescuentos.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Aportes Empl.</p>
          <p className="text-lg font-bold text-blue-600">S/ {detail.totalAportesEmpleador.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card text-center border-2 border-woden-primary">
          <p className="text-xs text-gray-500">Neto a Pagar</p>
          <p className="text-lg font-bold text-woden-primary">S/ {detail.netoAPagar.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>Sistema: {detail.pensionSystem} {detail.pensionProvider}</span>
        <span>Dependientes: {detail.hasDependents ? "Sí" : "No"}</span>
        <span>C. Costo: {detail.employee.costCenter} {detail.employee.costCenterDesc ? `- ${detail.employee.costCenterDesc}` : ""}</span>
      </div>

      {hasAdjustments && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm text-amber-800 text-sm">
          Este cálculo tiene ajustes manuales. Las líneas ajustadas están resaltadas en naranja.
          Consulte el <Link href="/planilla/excepciones" className="underline font-medium">reporte de excepciones</Link> para más detalles.
        </div>
      )}

      {/* Concept Breakdown */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Concepto</h2>
        <table className="w-full text-sm">
          {categories.map((cat) => {
            const catLines = detail.lines.filter((l) => l.category === cat);
            if (catLines.length === 0) return null;
            return (
              <tbody key={cat}>
                <tr>
                  <td colSpan={6} className={`${CATEGORY_COLORS[cat]} text-white text-xs font-semibold px-3 py-1.5`}>
                    {CATEGORY_LABELS[cat]}
                  </td>
                </tr>
                {catLines.map((line) => (
                  <tr
                    key={line.id}
                    className={`border-b border-gray-100 ${line.isAdjusted ? "bg-amber-50" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-3 py-2 text-gray-500 text-xs w-24">{line.conceptCode}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {line.conceptName}
                      {line.isAdjusted && (
                        <span className="ml-1 text-amber-600 text-xs" title={`Ajustado: ${line.adjustmentReason || ""}`}>
                          (ajustado)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">
                      {line.calcBase !== null ? `Base: ${line.calcBase.toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">
                      {line.calcRate !== null ? `${line.calcRate}%` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-medium w-32">
                      S/ {line.amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs w-32">
                      {line.isAdjusted && line.autoAmount !== null && (
                        <span title="Monto automático original">
                          (auto: S/ {line.autoAmount.toLocaleString("es-PE", { minimumFractionDigits: 2 })})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {catLines.filter((l) => l.isAdjusted && l.adjustmentReason).map((line) => (
                  <tr key={`reason-${line.id}`} className="bg-amber-50">
                    <td></td>
                    <td colSpan={5} className="px-3 py-1 text-xs text-amber-700">
                      Razón: {line.adjustmentReason} {line.adjustedBy ? `(por ${line.adjustedBy})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Input Snapshot */}
      {snapshot && (
        <div className="card">
          <button
            onClick={() => setShowSnapshot(!showSnapshot)}
            className="text-sm font-medium text-gray-700 hover:text-woden-primary flex items-center gap-2"
          >
            <span>{showSnapshot ? "▼" : "▶"}</span>
            Variables de Entrada Utilizadas
          </button>
          {showSnapshot && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {Object.entries(snapshot).map(([key, val]) => (
                <div key={key} className="flex justify-between border-b border-gray-100 py-1">
                  <span className="text-gray-500">{key}</span>
                  <span className="font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
