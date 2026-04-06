"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface MrpRunSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  startMonth: number;
  startYear: number;
  horizonMonths: number;
}

interface MrpRunDetail {
  id: string;
  name: string;
  startMonth: number;
  startYear: number;
  horizonMonths: number;
  status: string;
  notes: string | null;
  createdAt: string;
  createdByEmail: string | null;
  purchasePlans: {
    id: string;
    month: number;
    year: number;
    quantityNeeded: number;
    quantityRecovered: number;
    quantityToPurchase: number;
    orderDate: string | null;
    deliveryDate: string | null;
    unitCost: number;
    totalCost: number;
    material: { id: string; code: string; name: string } | null;
    supplierItem: { id: string; supplier: { id: string; name: string } } | null;
  }[];
  productionPlans: {
    id: string;
    month: number;
    year: number;
    unitsToProcess: number;
    laborHoursRequired: number;
    headcountRequired: number;
    isSpecialist: boolean;
    equipment: { id: string; code: string; name: string };
    subProcess: { id: string; name: string };
    shift: { id: string; name: string } | null;
  }[];
  summary: {
    totalPurchaseCost: number;
    totalLaborHours: number;
    totalHeadcount: number;
    purchaseLineItems: number;
    productionLineItems: number;
  };
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const CHART_COLORS = ["#EA7704", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#d97706", "#4f46e5"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE").format(value);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
}

export default function MrpReportesPage() {
  const { authenticated } = useAuth();
  const [runs, setRuns] = useState<MrpRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [runDetail, setRunDetail] = useState<MrpRunDetail | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch all runs
  useEffect(() => {
    if (!authenticated) return;
    setLoadingRuns(true);
    fetch("/api/remanufactura/mrp/run")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.runs || [];
        setRuns(list);
      })
      .catch((e) => console.error("Error:", e))
      .finally(() => setLoadingRuns(false));
  }, [authenticated]);

  // Fetch run detail when selection changes
  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/remanufactura/mrp/run/${selectedRunId}`)
      .then((r) => r.json())
      .then((data) => setRunDetail(data))
      .catch((e) => console.error("Error:", e))
      .finally(() => setLoadingDetail(false));
  }, [selectedRunId]);

  // Chart data: monthly purchase cost by top 5 components
  const purchaseCostChart = useMemo(() => {
    if (!runDetail) return [];

    // Find top 5 components by total cost
    const componentCosts = new Map<string, { name: string; total: number }>();
    for (const pp of runDetail.purchasePlans) {
      const key = pp.material?.code || "unknown";
      const entry = componentCosts.get(key) || { name: pp.material?.name || "—", total: 0 };
      entry.total += pp.totalCost;
      componentCosts.set(key, entry);
    }
    const top5 = Array.from(componentCosts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([code]) => code);

    // Build monthly data
    const monthMap = new Map<string, Record<string, number> & { label: string }>();
    for (const pp of runDetail.purchasePlans) {
      if (!pp.material?.code || !top5.includes(pp.material.code)) continue;
      const key = `${pp.year}-${String(pp.month).padStart(2, "0")}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { label: `${MONTH_SHORT[pp.month - 1]} ${pp.year}` } as Record<string, number> & { label: string });
      }
      const entry = monthMap.get(key)!;
      entry[pp.material?.code] = (entry[pp.material?.code] as number || 0) + pp.totalCost;
    }

    return {
      data: Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
      components: top5.map((code) => ({
        code,
        name: componentCosts.get(code)?.name || code,
      })),
    };
  }, [runDetail]);

  // Chart data: monthly headcount (general vs specialist)
  const headcountChart = useMemo(() => {
    if (!runDetail) return [];

    const monthMap = new Map<string, { label: string; general: number; especialista: number }>();
    for (const pp of runDetail.productionPlans) {
      const key = `${pp.year}-${String(pp.month).padStart(2, "0")}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { label: `${MONTH_SHORT[pp.month - 1]} ${pp.year}`, general: 0, especialista: 0 });
      }
      const entry = monthMap.get(key)!;
      if (pp.isSpecialist) {
        entry.especialista += pp.headcountRequired;
      } else {
        entry.general += pp.headcountRequired;
      }
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [runDetail]);

  // Dotacion summary for Excel
  const dotacionSummary = useMemo(() => {
    if (!runDetail) return [];
    const monthMap = new Map<string, { month: number; year: number; general: number; specialist: number }>();
    for (const pp of runDetail.productionPlans) {
      const key = `${pp.year}-${pp.month}`;
      if (!monthMap.has(key)) monthMap.set(key, { month: pp.month, year: pp.year, general: 0, specialist: 0 });
      const entry = monthMap.get(key)!;
      if (pp.isSpecialist) entry.specialist += pp.headcountRequired;
      else entry.general += pp.headcountRequired;
    }
    return Array.from(monthMap.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [runDetail]);

  const exportToExcel = () => {
    if (!runDetail) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Plan de Compras
    const comprasData = runDetail.purchasePlans.map((pp) => ({
      "Codigo": pp.material?.code,
      "Componente": pp.material?.name,
      "Proveedor": pp.supplierItem?.supplier.name || "Sin proveedor",
      "Mes": MONTH_NAMES[pp.month - 1],
      "Ano": pp.year,
      "Necesaria": pp.quantityNeeded,
      "Recuperada": pp.quantityRecovered,
      "A Comprar": pp.quantityToPurchase,
      "Fecha Orden": pp.orderDate || "",
      "Fecha Entrega": pp.deliveryDate || "",
      "Costo Unit.": pp.unitCost,
      "Costo Total": pp.totalCost,
    }));
    const wsCompras = XLSX.utils.json_to_sheet(comprasData);
    XLSX.utils.book_append_sheet(wb, wsCompras, "Plan de Compras");

    // Sheet 2: Plan de Produccion
    const prodData = runDetail.productionPlans.map((pp) => ({
      "Codigo Equipo": pp.equipment.code,
      "Equipo": pp.equipment.name,
      "Sub-Proceso": pp.subProcess.name,
      "Turno": pp.shift?.name || "Sin turno",
      "Mes": MONTH_NAMES[pp.month - 1],
      "Ano": pp.year,
      "Unidades": pp.unitsToProcess,
      "Horas": pp.laborHoursRequired,
      "Dotacion": pp.headcountRequired,
      "Especialista": pp.isSpecialist ? "Si" : "No",
    }));
    const wsProd = XLSX.utils.json_to_sheet(prodData);
    XLSX.utils.book_append_sheet(wb, wsProd, "Plan de Produccion");

    // Sheet 3: Resumen Dotacion
    const dotData = dotacionSummary.map((d) => ({
      "Mes": MONTH_NAMES[d.month - 1],
      "Ano": d.year,
      "General": d.general,
      "Especialista": d.specialist,
      "Total": d.general + d.specialist,
    }));
    const wsDot = XLSX.utils.json_to_sheet(dotData);
    XLSX.utils.book_append_sheet(wb, wsDot, "Resumen Dotacion");

    // Download
    const dateStr = new Date().toISOString().split("T")[0];
    const safeName = runDetail.name.replace(/[^a-zA-Z0-9\-_ ]/g, "").replace(/\s+/g, "_");
    XLSX.writeFile(wb, `MRP_Reporte_${safeName}_${dateStr}.xlsx`);
  };

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Debe iniciar sesion para acceder a esta pagina.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Reportes MRP</h1>
        {runDetail && (
          <button className="btn-primary" onClick={exportToExcel}>
            Exportar a Excel
          </button>
        )}
      </div>

      {/* Run selector */}
      <div className="card">
        <label className="label-field">Seleccionar Corrida MRP</label>
        {loadingRuns ? (
          <div className="h-10 bg-gray-100 rounded-sm animate-pulse" />
        ) : (
          <select
            className="input-field max-w-lg"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
          >
            <option value="">-- Seleccione una corrida --</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({formatDate(r.createdAt)}) - {r.status}
              </option>
            ))}
          </select>
        )}
      </div>

      {loadingDetail && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-8 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      )}

      {runDetail && !loadingDetail && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card">
              <p className="text-sm text-gray-500">Total Compras</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(runDetail.summary.totalPurchaseCost)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Total Horas</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatNumber(runDetail.summary.totalLaborHours)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Dotacion Pico</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatNumber(runDetail.summary.totalHeadcount)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Lineas de Compra</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatNumber(runDetail.summary.purchaseLineItems)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Lineas Produccion</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatNumber(runDetail.summary.productionLineItems)}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Purchase cost chart */}
            <div className="card">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Costo Mensual de Compras (Top 5 Componentes)</h3>
              {purchaseCostChart && "data" in purchaseCostChart && purchaseCostChart.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={purchaseCostChart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const comp = purchaseCostChart.components.find((c) => c.code === name);
                        return [formatCurrency(value), comp?.name || name];
                      }}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const comp = purchaseCostChart.components.find((c) => c.code === value);
                        return comp?.name || value;
                      }}
                    />
                    {purchaseCostChart.components.map((comp, i) => (
                      <Bar key={comp.code} dataKey={comp.code} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">Sin datos de compras</div>
              )}
            </div>

            {/* Headcount chart */}
            <div className="card">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Dotacion Mensual (General vs Especialista)</h3>
              {headcountChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={headcountChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="general" name="General" stackId="a" fill="#EA7704" />
                    <Bar dataKey="especialista" name="Especialista" stackId="a" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">Sin datos de produccion</div>
              )}
            </div>
          </div>
        </>
      )}

      {!selectedRunId && !loadingRuns && (
        <div className="card text-center text-gray-400 py-12">
          Seleccione una corrida MRP para ver reportes y exportar datos.
        </div>
      )}
    </div>
  );
}
