"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
} from "recharts";

type ReportTab = "iterations" | "faults-diag" | "faults-repair" | "faults-by-iteration" | "transactions" | "families";

interface IterationData {
  iteracion: number;
  cantidad: number;
  porcentaje: number;
}

interface FaultData {
  falla: string;
  fallaDescripcion: string;
  cantidad: number;
  porcentaje: number;
}

interface FaultByIterationData {
  iteracion: number;
  fallas: FaultData[];
  totalConFalla: number;
  totalSinFalla: number;
}

interface FamilyData {
  familia: string;
  cantidad: number;
  porcentaje: number;
}

interface TxTypeData {
  tipo: string;
  cantidad: number;
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: "iterations", label: "Iteraciones" },
  { key: "faults-diag", label: "Fallas Diagnóstico" },
  { key: "faults-repair", label: "Fallas Reparación" },
  { key: "faults-by-iteration", label: "Fallas x Iteración" },
  { key: "families", label: "Familias" },
  { key: "transactions", label: "Tipos Transacción" },
];

const COLORS = ["#EA7704", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#d97706", "#4f46e5", "#be185d", "#059669"];

const ORDINAL_NAMES: Record<number, string> = {
  1: "Primera",
  2: "Segunda",
  3: "Tercera",
  4: "Cuarta",
  5: "Quinta",
  6: "Sexta",
  7: "Séptima",
  8: "Octava",
  9: "Novena",
  10: "Décima",
};

export default function RemanufacturaReportesPage() {
  const { authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>("iterations");
  const [loading, setLoading] = useState(true);

  // Data
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [faultsDiag, setFaultsDiag] = useState<FaultData[]>([]);
  const [faultsRep, setFaultsRep] = useState<FaultData[]>([]);
  const [faultsByIteration, setFaultsByIteration] = useState<FaultByIterationData[]>([]);
  const [families, setFamilies] = useState<FamilyData[]>([]);
  const [txTypes, setTxTypes] = useState<TxTypeData[]>([]);

  // Filter options
  const [clientes, setClientes] = useState<{ nombre: string; cantidad: number }[]>([]);
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);

  // Filters — defaults match Dashboard
  const [source, setSource] = useState("");
  const [fechaDesde, setFechaDesde] = useState("2025-07-01");
  const [fechaHasta, setFechaHasta] = useState("2026-02-28");
  const [familiaEquipo, setFamiliaEquipo] = useState("");
  const [tipoEquipo, setTipoEquipo] = useState<"todos" | "equipos" | "sim">("equipos");
  const [cliente, setCliente] = useState("");
  const [anio, setAnio] = useState("");
  const [mes, setMes] = useState("");

  // Load filter options, then set smart defaults
  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/remanufactura/stats?type=filter-options")
      .then((r) => r.json())
      .then((data) => {
        const cls = data.clientes || [];
        const years = data.anios || [];
        setClientes(cls);
        setAniosDisponibles(years);
        if (cls.some((c: { nombre: string }) => c.nombre === "DIRECTV")) setCliente("DIRECTV");
        else setCliente("");
        if (!fechaDesde && !fechaHasta) {
          const apiMaxYear = data.maxYear;
          const apiMaxMonth = data.maxMonth;
          if (apiMaxYear) {
            setAnio(String(apiMaxYear));
            if (apiMaxMonth) setMes(String(apiMaxMonth));
          } else if (years.length > 0) {
            setAnio(String(Math.max(...years)));
          }
        }
        setFiltersReady(true);
      })
      .catch(() => setFiltersReady(true));
  }, [authenticated]);

  const EQUIPO_FAMILIES = "HD ONLY,HD DVR,DIGITAL,4K OTT,4K DVR,DVR,FTTHMODEM,MODEM,LIM";
  const SIM_FAMILIES = "SIM,SC";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (fechaDesde) params.set("fechaDesde", fechaDesde);
    if (fechaHasta) params.set("fechaHasta", fechaHasta);
    if (familiaEquipo) {
      params.set("familiaEquipo", familiaEquipo);
    } else if (tipoEquipo === "equipos") {
      params.set("familiaEquipo", EQUIPO_FAMILIES);
    } else if (tipoEquipo === "sim") {
      params.set("familiaEquipo", SIM_FAMILIES);
    }
    if (cliente) params.set("cliente", cliente);
    if (anio) params.set("anio", anio);
    if (mes) params.set("mes", mes);
    return params.toString();
  }, [source, fechaDesde, fechaHasta, familiaEquipo, tipoEquipo, cliente, anio, mes]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const query = buildQuery();
    try {
      const res = await fetch(`/api/remanufactura/analysis?${query}`);
      if (res.ok) {
        const data = await res.json();
        setIterations(data.iterations || []);
        setFaultsDiag(data.faultsDiagnostico || []);
        setFaultsRep(data.faultsReparacion || []);
        setFaultsByIteration(data.faultsByIteration || []);
        setFamilies(data.families || []);
        setTxTypes(data.transactionTypes || []);
      }
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (authenticated && filtersReady) fetchData();
  }, [authenticated, fetchData]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Iterations sheet
    if (iterations.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        iterations.map((it) => ({
          Refurbish: ORDINAL_NAMES[it.iteracion] || `${it.iteracion}ª`,
          Cantidad: it.cantidad,
          "Porcentaje (%)": it.porcentaje,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "Iteraciones");
    }

    // Faults Diag sheet
    if (faultsDiag.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        faultsDiag.map((f) => ({
          "Código Falla": f.falla,
          Descripción: f.fallaDescripcion,
          Cantidad: f.cantidad,
          "Porcentaje (%)": f.porcentaje,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "Fallas Diagnóstico");
    }

    // Faults Repair sheet
    if (faultsRep.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        faultsRep.map((f) => ({
          "Código Falla": f.falla,
          Descripción: f.fallaDescripcion,
          Cantidad: f.cantidad,
          "Porcentaje (%)": f.porcentaje,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "Fallas Reparación");
    }

    // Families sheet
    if (families.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        families.map((f) => ({
          Familia: f.familia,
          Cantidad: f.cantidad,
          "Porcentaje (%)": f.porcentaje,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "Familias");
    }

    // Transaction types sheet
    if (txTypes.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        txTypes.map((t) => ({
          "Tipo Transacción": t.tipo,
          Cantidad: t.cantidad,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "Tipos Transacción");
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `Remanufactura_Analisis_${dateStr}.xlsx`);
  };

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Inicia sesión para acceder.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes — Remanufactura</h1>
          <p className="text-sm text-gray-500 mt-1">Análisis detallado de equipos procesados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="btn-primary text-sm px-4 py-2">
            Exportar Excel
          </button>
          <Link href="/remanufactura" className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50">
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500 mr-2">Tipo:</span>
          {([["todos", "Todos"], ["equipos", "Equipos"], ["sim", "SIM & SC"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setTipoEquipo(val); setFamiliaEquipo(""); }}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                tipoEquipo === val
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-300 hover:border-orange-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="input-field text-sm">
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.cantidad.toLocaleString()})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            <select value={anio} onChange={(e) => { setAnio(e.target.value); if (!e.target.value) setMes(""); if (e.target.value) { setFechaDesde(""); setFechaHasta(""); } }} className="input-field text-sm">
              <option value="">Todos</option>
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
            <select value={mes} onChange={(e) => { setMes(e.target.value); if (e.target.value) { setFechaDesde(""); setFechaHasta(""); } }} className="input-field text-sm" disabled={!anio}>
              <option value="">Todos</option>
              {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Familia</label>
            <select value={familiaEquipo} onChange={(e) => setFamiliaEquipo(e.target.value)} className="input-field text-sm">
              <option value="">Todas</option>
              <option value="HD ONLY">HD ONLY</option>
              <option value="HD DVR">HD DVR</option>
              <option value="SD">SD</option>
              <option value="MODEM">MODEM</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fuente</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="input-field text-sm">
              <option value="">Todas</option>
              <option value="OSCM">OSCM</option>
              <option value="WMS">WMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); if (e.target.value) { setAnio(""); setMes(""); } }} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); if (e.target.value) { setAnio(""); setMes(""); } }} className="input-field text-sm" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-woden-primary text-woden-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando análisis...</div>
      ) : (
        <div className="space-y-6">
          {activeTab === "iterations" && <IterationsReport data={iterations} />}
          {activeTab === "faults-diag" && <FaultsReport data={faultsDiag} title="Fallas en Diagnóstico" color="#dc2626" />}
          {activeTab === "faults-repair" && <FaultsReport data={faultsRep} title="Fallas en Reparación" color="#d97706" />}
          {activeTab === "faults-by-iteration" && <FaultsByIterationReport data={faultsByIteration} />}
          {activeTab === "families" && <FamiliesReport data={families} />}
          {activeTab === "transactions" && <TransactionTypesReport data={txTypes} />}
        </div>
      )}
    </div>
  );
}

function IterationsReport({ data }: { data: IterationData[] }) {
  if (data.length === 0) return <EmptyState />;

  const total = data.reduce((s, d) => s + d.cantidad, 0);
  const multipleEntry = data.filter((d) => d.iteracion > 1).reduce((s, d) => s + d.cantidad, 0);
  const circularityRate = total > 0 ? ((multipleEntry / total) * 100).toFixed(1) : "0";

  // Cumulative data for composed chart
  let cumulative = 0;
  const chartData = data.map((d) => {
    cumulative += d.porcentaje;
    return {
      ...d,
      nombre: ORDINAL_NAMES[d.iteracion] || `${d.iteracion}ª`,
      acumulado: Math.round(cumulative * 10) / 10,
    };
  });

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500">Total Equipos</p>
          <p className="text-2xl font-bold text-gray-900">{total.toLocaleString()}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500">Tasa de Circularidad</p>
          <p className="text-2xl font-bold text-blue-600">{circularityRate}%</p>
          <p className="text-xs text-gray-400">Equipos con &gt;1 ingreso</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500">Reingresos</p>
          <p className="text-2xl font-bold text-woden-primary">{multipleEntry.toLocaleString()}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribución por Número de Ingreso</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nombre" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "cantidad") return [value.toLocaleString(), "Equipos"];
                if (name === "acumulado") return [`${value}%`, "Acumulado"];
                return [value, name];
              }}
            />
            <Bar yAxisId="left" dataKey="cantidad" name="cantidad" radius={[4, 4, 0, 0]}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
            <Line yAxisId="right" dataKey="acumulado" name="acumulado" stroke="#dc2626" strokeWidth={2} dot />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Refurbish</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500" style={{ width: "40%" }}>
                Proporción
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((it) => (
              <tr key={it.iteracion} className="border-b border-gray-100">
                <td className="py-2 px-3 font-medium">{ORDINAL_NAMES[it.iteracion] || `${it.iteracion}ª`}</td>
                <td className="py-2 px-3 text-right">{it.cantidad.toLocaleString()}</td>
                <td className="py-2 px-3 text-right text-gray-500">{it.porcentaje}%</td>
                <td className="py-2 px-3">
                  <div className="w-full bg-gray-100 rounded-full h-4">
                    <div
                      className="h-4 rounded-full"
                      style={{
                        width: `${it.porcentaje}%`,
                        backgroundColor: COLORS[(it.iteracion - 1) % COLORS.length],
                        minWidth: it.porcentaje > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 font-bold">
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right">{total.toLocaleString()}</td>
              <td className="py-2 px-3 text-right">100%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function FaultsReport({ data, title, color }: { data: FaultData[]; title: string; color: string }) {
  if (data.length === 0) return <EmptyState />;

  const total = data.reduce((s, d) => s + d.cantidad, 0);

  return (
    <>
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 35)}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="fallaDescripcion" type="category" width={200} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => [value.toLocaleString(), "Equipos"]} />
            <Bar dataKey="cantidad" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">#</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Código</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Falla</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((f, idx) => (
              <tr key={f.falla} className="border-b border-gray-100">
                <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                <td className="py-2 px-3 font-mono text-xs">{f.falla}</td>
                <td className="py-2 px-3">{f.fallaDescripcion}</td>
                <td className="py-2 px-3 text-right font-medium">{f.cantidad.toLocaleString()}</td>
                <td className="py-2 px-3 text-right text-gray-500">{f.porcentaje}%</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 font-bold">
              <td></td>
              <td></td>
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right">{total.toLocaleString()}</td>
              <td className="py-2 px-3 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function FaultsByIterationReport({ data }: { data: FaultByIterationData[] }) {
  if (data.length === 0) return <EmptyState />;

  // Build unique fault list across all iterations for cross-tab
  const allFaults = new Map<string, string>(); // code → description
  for (const iter of data) {
    for (const f of iter.fallas) {
      if (!allFaults.has(f.falla)) allFaults.set(f.falla, f.fallaDescripcion);
    }
  }
  const faultList = Array.from(allFaults.entries()).sort((a, b) => {
    // Sort by total quantity across all iterations
    const totalA = data.reduce((s, iter) => s + (iter.fallas.find((f) => f.falla === a[0])?.cantidad || 0), 0);
    const totalB = data.reduce((s, iter) => s + (iter.fallas.find((f) => f.falla === b[0])?.cantidad || 0), 0);
    return totalB - totalA;
  });

  // Build stacked bar chart data (top 8 faults + "Otras")
  const topFaults = faultList.slice(0, 8);
  const otherFaultCodes = faultList.slice(8).map(([code]) => code);
  const FAULT_COLORS: Record<string, string> = {};
  topFaults.forEach(([code], i) => { FAULT_COLORS[code] = COLORS[i % COLORS.length]; });

  const stackedData = data.map((iter) => {
    const row: Record<string, unknown> = {
      nombre: ORDINAL_NAMES[iter.iteracion] || `${iter.iteracion}ª`,
      sinFalla: iter.totalSinFalla,
    };
    for (const [code] of topFaults) {
      row[code] = iter.fallas.find((f) => f.falla === code)?.cantidad || 0;
    }
    if (otherFaultCodes.length > 0) {
      row["OTRAS"] = iter.fallas
        .filter((f) => otherFaultCodes.includes(f.falla))
        .reduce((s, f) => s + f.cantidad, 0);
    }
    return row;
  });

  return (
    <div className="space-y-6">
      {/* Stacked bar chart: faults by iteration */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Causas de Falla por Número de Ingreso</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={stackedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nombre" />
            <YAxis />
            <Tooltip formatter={(value: number) => value.toLocaleString()} />
            <Bar dataKey="sinFalla" stackId="a" fill="#16a34a" name="Sin Falla" />
            {topFaults.map(([code, desc]) => (
              <Bar key={code} dataKey={code} stackId="a" fill={FAULT_COLORS[code]} name={desc} />
            ))}
            {otherFaultCodes.length > 0 && (
              <Bar dataKey="OTRAS" stackId="a" fill="#9ca3af" name="Otras" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cross-tab table: Falla × Iteración */}
      <div className="card p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Tabla Cruzada: Causa de Falla × Número de Ingreso
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 px-2 font-semibold text-gray-600 sticky left-0 bg-white min-w-[160px]">
                Causa de Falla
              </th>
              {data.map((iter) => (
                <th key={iter.iteracion} className="text-center py-2 px-1 font-semibold text-gray-600" colSpan={2}>
                  {ORDINAL_NAMES[iter.iteracion] || `${iter.iteracion}ª`}
                </th>
              ))}
              <th className="text-center py-2 px-1 font-semibold text-gray-800 border-l-2 border-gray-300" colSpan={2}>
                Total
              </th>
            </tr>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 bg-white"></th>
              {data.map((iter) => (
                <Fragment key={iter.iteracion}>
                  <th className="text-right py-1 px-1 text-gray-400 font-normal">Cant</th>
                  <th className="text-right py-1 px-1 text-gray-400 font-normal">%</th>
                </Fragment>
              ))}
              <th className="text-right py-1 px-1 text-gray-400 font-normal border-l-2 border-gray-300">Cant</th>
              <th className="text-right py-1 px-1 text-gray-400 font-normal">%</th>
            </tr>
          </thead>
          <tbody>
            {/* Sin Falla row */}
            <tr className="border-b border-gray-100 bg-green-50">
              <td className="py-1.5 px-2 font-medium text-green-700 sticky left-0 bg-green-50">Sin Falla</td>
              {data.map((iter) => {
                const iterDisplayTotal = iter.totalSinFalla + iter.fallas.reduce((s, f) => s + f.cantidad, 0);
                const pct = iterDisplayTotal > 0 ? ((iter.totalSinFalla / iterDisplayTotal) * 100).toFixed(1) : "0";
                return (
                  <Fragment key={iter.iteracion}>
                    <td className="text-right py-1.5 px-1 text-green-700">{iter.totalSinFalla.toLocaleString()}</td>
                    <td className="text-right py-1.5 px-1 text-green-600">{pct}%</td>
                  </Fragment>
                );
              })}
              {(() => {
                const totalSF = data.reduce((s, d) => s + d.totalSinFalla, 0);
                const grandDisplayTotal = data.reduce((s, d) => s + d.totalSinFalla + d.fallas.reduce((fs, f) => fs + f.cantidad, 0), 0);
                return (
                  <>
                    <td className="text-right py-1.5 px-1 font-bold text-green-700 border-l-2 border-gray-300">{totalSF.toLocaleString()}</td>
                    <td className="text-right py-1.5 px-1 font-bold text-green-600">{grandDisplayTotal > 0 ? ((totalSF / grandDisplayTotal) * 100).toFixed(1) : 0}%</td>
                  </>
                );
              })()}
            </tr>

            {/* Each fault row */}
            {faultList.map(([code, desc]) => {
              const totalForFault = data.reduce(
                (s, iter) => s + (iter.fallas.find((f) => f.falla === code)?.cantidad || 0), 0
              );

              return (
                <tr key={code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 px-2 font-medium sticky left-0 bg-white">{desc}</td>
                  {data.map((iter) => {
                    const iterDisplayTotal = iter.totalSinFalla + iter.fallas.reduce((s, f) => s + f.cantidad, 0);
                    const val = iter.fallas.find((f) => f.falla === code)?.cantidad || 0;
                    const pct = iterDisplayTotal > 0 ? ((val / iterDisplayTotal) * 100).toFixed(1) : "0";
                    return (
                      <Fragment key={iter.iteracion}>
                        <td className="text-right py-1.5 px-1">{val > 0 ? val.toLocaleString() : "—"}</td>
                        <td className="text-right py-1.5 px-1 text-gray-400">{val > 0 ? `${pct}%` : ""}</td>
                      </Fragment>
                    );
                  })}
                  {(() => {
                    const grandDisplayTotal = data.reduce((s, d) => s + d.totalSinFalla + d.fallas.reduce((fs, f) => fs + f.cantidad, 0), 0);
                    return (
                      <>
                        <td className="text-right py-1.5 px-1 font-semibold border-l-2 border-gray-300">{totalForFault.toLocaleString()}</td>
                        <td className="text-right py-1.5 px-1 text-gray-500">{grandDisplayTotal > 0 ? ((totalForFault / grandDisplayTotal) * 100).toFixed(1) : 0}%</td>
                      </>
                    );
                  })()}
                </tr>
              );
            })}

            {/* Totals row */}
            <tr className="border-t-2 border-gray-400 font-bold bg-gray-50">
              <td className="py-2 px-2 sticky left-0 bg-gray-50">Total</td>
              {data.map((iter) => {
                const iterDisplayTotal = iter.totalSinFalla + iter.fallas.reduce((s, f) => s + f.cantidad, 0);
                return (
                  <Fragment key={iter.iteracion}>
                    <td className="text-right py-2 px-1">{iterDisplayTotal.toLocaleString()}</td>
                    <td className="text-right py-2 px-1">100%</td>
                  </Fragment>
                );
              })}
              {(() => {
                const grandDisplayTotal = data.reduce((s, d) => s + d.totalSinFalla + d.fallas.reduce((fs, f) => fs + f.cantidad, 0), 0);
                return (
                  <>
                    <td className="text-right py-2 px-1 border-l-2 border-gray-300">{grandDisplayTotal.toLocaleString()}</td>
                    <td className="text-right py-2 px-1">100%</td>
                  </>
                );
              })()}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Individual iteration detail cards */}
      {data.map((iter) => {
        const fallaTotal = iter.fallas.reduce((s, f) => s + f.cantidad, 0);
        if (iter.fallas.length === 0) return null;

        return (
          <div key={iter.iteracion} className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {ORDINAL_NAMES[iter.iteracion] || `${iter.iteracion}ª`} Iteración
              <span className="text-gray-400 font-normal ml-2">
                ({fallaTotal.toLocaleString()} fallas registradas)
              </span>
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1.5 px-3 text-xs font-semibold text-gray-500">Falla</th>
                  <th className="text-right py-1.5 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
                  <th className="text-right py-1.5 px-3 text-xs font-semibold text-gray-500">%</th>
                </tr>
              </thead>
              <tbody>
                {iter.fallas.map((f) => (
                  <tr key={f.falla} className="border-b border-gray-100">
                    <td className="py-1.5 px-3">{f.fallaDescripcion}</td>
                    <td className="py-1.5 px-3 text-right">{f.cantidad.toLocaleString()}</td>
                    <td className="py-1.5 px-3 text-right text-gray-500">{fallaTotal > 0 ? ((f.cantidad / fallaTotal) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-1.5 px-3">Total</td>
                  <td className="py-1.5 px-3 text-right">{fallaTotal.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function FamiliesReport({ data }: { data: FamilyData[] }) {
  if (data.length === 0) return <EmptyState />;
  const total = data.reduce((s, d) => s + d.cantidad, 0);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribución por Familia de Equipo</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="familia" />
            <YAxis />
            <Tooltip formatter={(value: number) => [value.toLocaleString(), "Equipos"]} />
            <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <table className="text-sm self-start">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Familia</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => (
              <tr key={f.familia} className="border-b border-gray-100">
                <td className="py-2 px-3 font-medium">{f.familia}</td>
                <td className="py-2 px-3 text-right">{f.cantidad.toLocaleString()}</td>
                <td className="py-2 px-3 text-right text-gray-500">{f.porcentaje}%</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 font-bold">
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right">{total.toLocaleString()}</td>
              <td className="py-2 px-3 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionTypesReport({ data }: { data: TxTypeData[] }) {
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Tipos de Transacción</h3>
      <ResponsiveContainer width="100%" height={Math.max(250, data.length * 35)}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="tipo" type="category" width={280} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: number) => [value.toLocaleString(), "Transacciones"]} />
          <Bar dataKey="cantidad" fill="#2563eb" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400">No hay datos para mostrar con los filtros seleccionados.</p>
      <Link href="/remanufactura/importar" className="text-sm text-woden-primary hover:underline mt-2 inline-block">
        Importar datos
      </Link>
    </div>
  );
}
