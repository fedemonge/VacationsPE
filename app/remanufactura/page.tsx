"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";

interface Stats {
  totalTransacciones: number;
  totalEquiposUnicos: number;
  totalOSCM: number;
  totalWMS: number;
  porFamilia: { familia: string; cantidad: number }[];
  sinFalla: number;
  conFalla: number;
  porcentajeSinFalla: number;
}

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

const COLORS = ["#EA7704", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#d97706", "#4f46e5"];
const DIAG_COLORS = { sinFalla: "#16a34a", conFalla: "#dc2626" };

export default function RemanufacturaPage() {
  const { authenticated } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [faultsDiag, setFaultsDiag] = useState<FaultData[]>([]);
  const [faultsRep, setFaultsRep] = useState<FaultData[]>([]);
  const [monthlyDiag, setMonthlyDiag] = useState<{ mes: string; sinFalla: number; conFalla: number; sinDiagnostico: number }[]>([]);
  const [faultsByIter, setFaultsByIter] = useState<{ iteracion: number; totalSinFalla: number; totalConFalla: number; fallas: { falla: string; fallaDescripcion: string; cantidad: number }[] }[]>([]);
  const [scrapByPeriod, setScrapByPeriod] = useState<{ mes: string; scrap: number; scrapEstrategico: number; raee: number; scSCrap: number; total: number }[]>([]);
  const [scrapByIteration, setScrapByIteration] = useState<{ totalScrapped: number; byIteration: { iteracion: number; scrap: number; scrapEstrategico: number; raee: number; scSCrap: number; total: number }[] }>({ totalScrapped: 0, byIteration: [] });
  const [scrapByReason, setScrapByReason] = useState<{ scrapType: string; diagnostico: string; falla: string; fallaCode: string; cantidad: number }[]>([]);
  const [scrapLoading, setScrapLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedIter, setExpandedIter] = useState<number | null>(null);
  const [iterDetail, setIterDetail] = useState<{ numeroSerie: string; familia: string; ultimaFalla: string; ultimoDiagnostico: string; primerIngreso: string; ultimoIngreso: string }[]>([]);
  const [iterDetailLoading, setIterDetailLoading] = useState(false);

  // Filter options (loaded from DB)
  const [clientes, setClientes] = useState<{ nombre: string; cantidad: number }[]>([]);
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);

  // Filters — defaults set after options load
  const [source, setSource] = useState("");
  const [fechaDesde, setFechaDesde] = useState("2025-07-01");
  const [fechaHasta, setFechaHasta] = useState("2026-02-28");
  const [familiaEquipo, setFamiliaEquipo] = useState("");
  const [tipoEquipo, setTipoEquipo] = useState<"todos" | "equipos" | "sim">("equipos");
  const [cliente, setCliente] = useState("");
  const [anio, setAnio] = useState(""); // cleared when fechaDesde/Hasta are set
  const [mes, setMes] = useState("");

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
        // Default to DIRECTV if available, otherwise show all
        if (cls.some((c: { nombre: string }) => c.nombre === "DIRECTV")) setCliente("DIRECTV");
        else setCliente("");
        // Only set year/month defaults if no date range is pre-set
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    const query = buildQuery();
    try {
      const [statsRes, analysisRes] = await Promise.all([
        fetch(`/api/remanufactura/stats?${query}`),
        fetch(`/api/remanufactura/analysis?${query}`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (analysisRes.ok) {
        const analysis = await analysisRes.json();
        setIterations(analysis.iterations || []);
        setFaultsDiag(analysis.faultsDiagnostico || []);
        setFaultsRep(analysis.faultsReparacion || []);
        setMonthlyDiag(analysis.monthlyDiagnostics || []);
        setFaultsByIter(analysis.faultsByIteration || []);
      }
    } catch (e) {
      console.error("Error fetching data:", e);
    } finally {
      setLoading(false);
    }
    // Fetch scrap data separately (slower queries, don't block main render)
    setScrapLoading(true);
    setScrapByPeriod([]);
    setScrapByIteration({ totalScrapped: 0, byIteration: [] });
    setScrapByReason([]);
    try {
      const scrapRes = await fetch(`/api/remanufactura/analysis?type=scrap&${query}`);
      if (scrapRes.ok) {
        const scrap = await scrapRes.json();
        setScrapByPeriod(scrap.scrapByPeriod || []);
        setScrapByIteration(scrap.scrapByIteration || { totalScrapped: 0, byIteration: [] });
        setScrapByReason(scrap.scrapByReason || []);
      }
    } catch (e) {
      console.error("Error fetching scrap:", e);
    } finally {
      setScrapLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (authenticated && filtersReady) { fetchData(); setExpandedIter(null); }
  }, [authenticated, filtersReady, fetchData]);

  const toggleIterDetail = async (iteracion: number) => {
    if (expandedIter === iteracion) { setExpandedIter(null); return; }
    setExpandedIter(iteracion);
    setIterDetailLoading(true);
    setIterDetail([]);
    try {
      const query = buildQuery();
      const res = await fetch(`/api/remanufactura/analysis?type=iteration-detail&iteracion=${iteracion}&${query}`);
      if (res.ok) setIterDetail(await res.json());
    } catch (e) { console.error(e); }
    setIterDetailLoading(false);
  };

  if (!authenticated) {
    return (
      <div className="p-8 text-center text-gray-500">
        Inicia sesión para acceder a Remanufactura.
      </div>
    );
  }

  const totalDiagnosticados = (stats?.sinFalla || 0) + (stats?.conFalla || 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Remanufactura — Economía Circular</h1>
          <p className="text-sm text-gray-500 mt-1">
            Análisis consolidado de equipos procesados (OSCM + WMS)
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/remanufactura/importar"
            className="btn-primary text-sm px-4 py-2"
          >
            Importar Datos
          </Link>
          <Link
            href="/remanufactura/reportes"
            className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50"
          >
            Reportes Detallados
          </Link>
          <Link
            href="/remanufactura/serie"
            className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50"
          >
            Buscar Serie
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

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando datos...</div>
      ) : !stats || stats.totalTransacciones === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No hay datos cargados</p>
          <p className="text-gray-400 text-sm mt-2">
            Importa archivos OSCM o WMS para comenzar el análisis.
          </p>
          <Link href="/remanufactura/importar" className="btn-primary mt-4 inline-block px-6 py-2">
            Importar Datos
          </Link>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <KpiCard
              label="Transacciones"
              value={stats.totalTransacciones.toLocaleString()}
              sub={`OSCM: ${stats.totalOSCM.toLocaleString()} | WMS: ${stats.totalWMS.toLocaleString()}`}
            />
            <KpiCard
              label="Equipos Únicos"
              value={stats.totalEquiposUnicos.toLocaleString()}
              sub="Por número de serie"
            />
            <KpiCard
              label="Sin Falla"
              value={stats.sinFalla.toLocaleString()}
              sub={`${stats.porcentajeSinFalla}% del total diagnosticado`}
              color="text-green-600"
            />
            <KpiCard
              label="Con Falla"
              value={stats.conFalla.toLocaleString()}
              sub={`${totalDiagnosticados > 0 ? (100 - stats.porcentajeSinFalla).toFixed(1) : 0}%`}
              color="text-red-600"
            />
            <KpiCard
              label="Tasa Circularidad"
              value={
                iterations.length > 1
                  ? `${iterations.slice(1).reduce((s, i) => s + i.porcentaje, 0).toFixed(1)}%`
                  : "—"
              }
              sub="Equipos con >1 ingreso"
              color="text-blue-600"
            />
            <KpiCard
              label="Iteraciones Max"
              value={iterations.length > 0 ? String(iterations[iterations.length - 1].iteracion) : "—"}
              sub="Máximo reingresos"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Equipment Family Distribution */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribución por Familia</h3>
              {stats.porFamilia.length > 0 ? (() => {
                const sortedFamilia = [...stats.porFamilia].sort((a, b) => b.cantidad - a.cantidad);
                return (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sortedFamilia}
                      dataKey="cantidad"
                      nameKey="familia"
                      cx="50%"
                      cy="45%"
                      outerRadius={80}
                      label={({ percent }) =>
                        percent > 0.03 ? `${(percent * 100).toFixed(1)}%` : ""
                      }
                      labelLine={false}
                      style={{ fontSize: 11 }}
                    >
                      {sortedFamilia.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [value.toLocaleString(), name]} />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: any, entry: any) => {
                        const pct = entry.payload?.percent ? (entry.payload.percent * 100).toFixed(1) : "0";
                        return `${value} (${pct}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                );
              })() : (
                <p className="text-gray-400 text-sm text-center py-8">Sin datos de familia</p>
              )}
            </div>

            {/* Diagnosis Result */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Resultado del Diagnóstico</h3>
              {totalDiagnosticados > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Sin Falla", value: stats.sinFalla },
                        { name: "Con Falla", value: stats.conFalla },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(1)}%`
                      }
                      style={{ fontSize: 11 }}
                    >
                      <Cell fill={DIAG_COLORS.sinFalla} />
                      <Cell fill={DIAG_COLORS.conFalla} />
                    </Pie>
                    <Tooltip formatter={(value: number) => [value.toLocaleString(), "Equipos"]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Sin datos de diagnóstico</p>
              )}
            </div>
          </div>

          {/* Monthly Diagnostics Bar Chart */}
          {monthlyDiag.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Transacciones Mensuales por Resultado de Diagnóstico</h3>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={monthlyDiag} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sinFalla" name="Sin Falla" fill="#16a34a" stackId="diag">
                    <LabelList dataKey="sinFalla" position="center" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} formatter={(v: number) => v.toLocaleString()} />
                  </Bar>
                  <Bar dataKey="conFalla" name="Con Falla" fill="#dc2626" stackId="diag">
                    <LabelList dataKey="conFalla" position="center" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} formatter={(v: number) => v.toLocaleString()} />
                  </Bar>
                  <Bar dataKey="sinDiagnostico" name="Sin Diagnóstico" fill="#9ca3af" stackId="diag" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="sinDiagnostico" position="center" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} formatter={(v: number) => v.toLocaleString()} />
                    <LabelList
                      content={({ x, y, width, index }: any) => {
                        if (x == null || y == null || width == null || index == null) return null;
                        const d = monthlyDiag[index];
                        if (!d) return null;
                        const total = d.sinFalla + d.conFalla + d.sinDiagnostico;
                        return (
                          <text x={x + width / 2} y={y - 6} textAnchor="middle" style={{ fontSize: 9, fill: "#374151", fontWeight: 700 }}>
                            {total.toLocaleString()}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Faults Charts + Detail Cards — above iterations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Diagnosis Faults */}
            {faultsDiag.filter((f) => f.cantidad > 0).length > 0 && (
              <div className="space-y-4">
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle — Sin Falla</h3>
                  <ResponsiveContainer width="100%" height={Math.max(200, faultsDiag.filter((f) => f.cantidad > 0).length * 30)}>
                    <BarChart data={faultsDiag.filter((f) => f.cantidad > 0)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="fallaDescripcion" type="category" width={180} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [value.toLocaleString(), "Equipos"]} />
                      <Bar dataKey="cantidad" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle Fallas — Sin Falla</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Falla</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faultsDiag.filter((f) => f.cantidad > 0).map((f) => (
                          <tr key={f.falla} className="border-b border-gray-100">
                            <td className="py-2 px-3">{f.fallaDescripcion}</td>
                            <td className="py-2 px-3 text-right font-medium">{f.cantidad.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{f.porcentaje}%</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right">{faultsDiag.filter((f) => f.cantidad > 0).reduce((s, f) => s + f.cantidad, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Repair Faults */}
            {faultsRep.filter((f) => f.cantidad > 0).length > 0 && (
              <div className="space-y-4">
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle — Con Falla</h3>
                  <ResponsiveContainer width="100%" height={Math.max(200, faultsRep.filter((f) => f.cantidad > 0).length * 30)}>
                    <BarChart data={faultsRep.filter((f) => f.cantidad > 0)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="fallaDescripcion" type="category" width={180} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [value.toLocaleString(), "Equipos"]} />
                      <Bar dataKey="cantidad" fill="#d97706" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle Fallas — Con Falla</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Falla</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Cantidad</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faultsRep.filter((f) => f.cantidad > 0).map((f) => (
                          <tr key={f.falla} className="border-b border-gray-100">
                            <td className="py-2 px-3">{f.fallaDescripcion}</td>
                            <td className="py-2 px-3 text-right font-medium">{f.cantidad.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{f.porcentaje}%</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right">{faultsRep.filter((f) => f.cantidad > 0).reduce((s, f) => s + f.cantidad, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Iterations Chart */}
          {iterations.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Equipos por Número de Refabricaciones
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={iterations}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="iteracion"
                    label={{ value: "Nº de Ingreso", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === "cantidad" ? "Equipos" : name,
                    ]}
                    labelFormatter={(label) => `Ingreso #${label}`}
                  />
                  <Bar dataKey="cantidad" fill="#EA7704" name="Equipos" radius={[4, 4, 0, 0]}>
                    {iterations.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Iterations Table with Diagnosis Breakdown */}
              <div className="mt-4 overflow-x-auto">
                {(() => {
                  const diagMap = new Map(faultsByIter.map((f) => [f.iteracion, f]));
                  const totalEquipos = iterations.reduce((s, i) => s + i.cantidad, 0);
                  const totalSinFalla = faultsByIter.reduce((s, f) => s + f.totalSinFalla, 0);
                  const totalConFalla = faultsByIter.reduce((s, f) => s + f.totalConFalla, 0);
                  const totalDiag = totalSinFalla + totalConFalla;
                  // Collect all unique fault codes sorted by total frequency
                  const faultTotals = new Map<string, { desc: string; total: number }>();
                  for (const fi of faultsByIter) {
                    for (const f of fi.fallas) {
                      const existing = faultTotals.get(f.falla) || { desc: f.fallaDescripcion, total: 0 };
                      existing.total += f.cantidad;
                      faultTotals.set(f.falla, existing);
                    }
                  }
                  const faultCols = Array.from(faultTotals.entries())
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 8); // top 8 faults
                  return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 whitespace-nowrap">Refurbish</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Equipos</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 whitespace-nowrap" title="% del total de equipos únicos">% Equipos</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-green-600 whitespace-nowrap">Sin Falla</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-green-600 whitespace-nowrap">% SF</th>
                      {faultCols.map(([code, { desc }]) => (
                        <th key={code} className="text-right py-2 px-2 text-xs font-semibold text-red-700 whitespace-nowrap" title={desc}>{desc}</th>
                      ))}
                      <th className="text-right py-2 px-2 text-xs font-semibold text-red-600 whitespace-nowrap">Total Fallas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iterations.map((it) => {
                      const diag = diagMap.get(it.iteracion);
                      const sf = diag?.totalSinFalla || 0;
                      const cf = diag?.totalConFalla || 0;
                      const diagTotal = sf + cf;
                      const fallaMap = new Map((diag?.fallas || []).map((f) => [f.falla, f.cantidad]));
                      const isExpanded = expandedIter === it.iteracion;
                      const totalCols = 5 + faultCols.length + 1;
                      return (
                      <>
                      <tr key={it.iteracion} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-orange-50" : ""}`} onClick={() => toggleIterDetail(it.iteracion)}>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <span className="inline-block w-4 text-gray-400 mr-1">{isExpanded ? "▾" : "▸"}</span>
                          {it.iteracion === 1 ? "Primera" : it.iteracion === 2 ? "Segunda" : it.iteracion === 3 ? "Tercera" : it.iteracion === 4 ? "Cuarta" : it.iteracion === 5 ? "Quinta" : `${it.iteracion}ª`}
                        </td>
                        <td className="py-2 px-2 text-right font-medium">{it.cantidad.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-gray-400">{it.porcentaje}%</td>
                        <td className="py-2 px-2 text-right text-green-600">{sf.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-green-600">
                          {diagTotal > 0 ? `${(sf / diagTotal * 100).toFixed(1)}%` : "—"}
                        </td>
                        {faultCols.map(([code]) => (
                          <td key={code} className="py-2 px-2 text-right text-red-600">{(fallaMap.get(code) || 0).toLocaleString()}</td>
                        ))}
                        <td className="py-2 px-2 text-right text-red-600 font-medium">{cf.toLocaleString()}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`detail-${it.iteracion}`}>
                          <td colSpan={totalCols} className="p-0">
                            <div className="bg-gray-50 border-y border-gray-200 px-4 py-3">
                              {iterDetailLoading ? (
                                <p className="text-xs text-gray-400">Cargando equipos...</p>
                              ) : iterDetail.length === 0 ? (
                                <p className="text-xs text-gray-400">No se encontraron equipos</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-300">
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Nº Serie</th>
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Familia</th>
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Última Falla</th>
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Último Diag.</th>
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Primer Ingreso</th>
                                      <th className="text-left py-1 px-2 font-semibold text-gray-500">Último Ingreso</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {iterDetail.map((d) => (
                                      <tr key={d.numeroSerie} className="border-b border-gray-100">
                                        <td className="py-1 px-2 font-mono"><a href={`/remanufactura/serie?s=${d.numeroSerie}`} className="text-blue-600 hover:underline">{d.numeroSerie}</a></td>
                                        <td className="py-1 px-2">{d.familia}</td>
                                        <td className="py-1 px-2">{d.ultimaFalla}</td>
                                        <td className="py-1 px-2">{d.ultimoDiagnostico === "SIN_FALLA" ? "Sin Falla" : d.ultimoDiagnostico === "CON_FALLA" ? "Con Falla" : d.ultimoDiagnostico}</td>
                                        <td className="py-1 px-2">{d.primerIngreso}</td>
                                        <td className="py-1 px-2">{d.ultimoIngreso}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <p className="text-xs text-gray-400 mt-2">Mostrando hasta 20 equipos de {it.cantidad.toLocaleString()}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      </>
                      );
                    })}
                    <tr className="border-t-2 border-gray-300 font-bold">
                      <td className="py-2 px-2">Total</td>
                      <td className="py-2 px-2 text-right">{totalEquipos.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">100%</td>
                      <td className="py-2 px-2 text-right text-green-600">{totalSinFalla.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-green-600">
                        {totalDiag > 0 ? `${(totalSinFalla / totalDiag * 100).toFixed(1)}%` : "—"}
                      </td>
                      {faultCols.map(([code, { total }]) => (
                        <td key={code} className="py-2 px-2 text-right text-red-600">{total.toLocaleString()}</td>
                      ))}
                      <td className="py-2 px-2 text-right text-red-600">{totalConFalla.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Scrap Analysis */}
          {scrapLoading && (
            <div className="card p-8 text-center text-gray-400">
              <p>Cargando análisis de scrap...</p>
            </div>
          )}
          {!scrapLoading && (scrapByPeriod.length > 0 || scrapByIteration.byIteration.length > 0) && (
            <>
              {/* Scrap by Period */}
              {scrapByPeriod.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Scrap Mensual por Tipo</h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={scrapByPeriod} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => value.toLocaleString()} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="scrap" name="SCRAP" fill="#dc2626" stackId="s" />
                      <Bar dataKey="scrapEstrategico" name="SCRAP Estratégico" fill="#ea580c" stackId="s" />
                      <Bar dataKey="raee" name="RAEE" fill="#d97706" stackId="s" />
                      <Bar dataKey="scSCrap" name="SC-SCRAP" fill="#9ca3af" stackId="s" radius={[4, 4, 0, 0]}>
                        <LabelList
                          content={({ x, y, width, index }: any) => {
                            if (x == null || y == null || width == null || index == null) return null;
                            const d = scrapByPeriod[index];
                            if (!d || d.total === 0) return null;
                            return (
                              <text x={x + width / 2} y={y - 6} textAnchor="middle" style={{ fontSize: 9, fill: "#374151", fontWeight: 700 }}>
                                {d.total.toLocaleString()}
                              </text>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Scrap by Iteration */}
              {scrapByIteration.byIteration.length > 0 && (() => {
                const iterMap = new Map(iterations.map((it) => [it.iteracion, it.cantidad]));
                const totalEquipos = iterations.reduce((s, it) => s + it.cantidad, 0);
                const totalScrap = scrapByIteration.byIteration.reduce((s, r) => s + r.total, 0);
                return (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Scrap por Número de Refabricaciones
                    <span className="text-gray-400 font-normal ml-2">
                      ({totalScrap.toLocaleString()} equipos enviados a scrap de {totalEquipos.toLocaleString()} — tasa: {totalEquipos > 0 ? (totalScrap / totalEquipos * 100).toFixed(1) : 0}%)
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Refabricación</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Equipos</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-red-600">SCRAP</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-orange-600">Estratégico</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-amber-600">RAEE</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">SC-SCRAP</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700">Total Scrap</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-red-700">Tasa Scrap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scrapByIteration.byIteration.map((row) => {
                          const lotSize = iterMap.get(row.iteracion) || 0;
                          const scrapRate = lotSize > 0 ? (row.total / lotSize * 100).toFixed(1) : "—";
                          return (
                          <tr key={row.iteracion} className="border-b border-gray-100">
                            <td className="py-2 px-3">{row.iteracion === 0 ? "Sin ingreso" : row.iteracion === 1 ? "Primera" : row.iteracion === 2 ? "Segunda" : row.iteracion === 3 ? "Tercera" : row.iteracion === 4 ? "Cuarta" : `${row.iteracion}ª`}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{lotSize.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-red-600">{row.scrap.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-orange-600">{row.scrapEstrategico.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-amber-600">{row.raee.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{row.scSCrap.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-medium">{row.total.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-bold text-red-700">{typeof scrapRate === "string" ? scrapRate : `${scrapRate}%`}</td>
                          </tr>
                          );
                        })}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right">{totalEquipos.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-600">{scrapByIteration.byIteration.reduce((s, r) => s + r.scrap, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-orange-600">{scrapByIteration.byIteration.reduce((s, r) => s + r.scrapEstrategico, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-amber-600">{scrapByIteration.byIteration.reduce((s, r) => s + r.raee, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-gray-500">{scrapByIteration.byIteration.reduce((s, r) => s + r.scSCrap, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">{totalScrap.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-bold text-red-700">{totalEquipos > 0 ? `${(totalScrap / totalEquipos * 100).toFixed(1)}%` : "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })()}

              {/* Scrap by Reason */}
              {scrapByReason.length > 0 && (() => {
                const total = scrapByReason.reduce((s, r) => s + r.cantidad, 0);
                const DIAG_LABELS: Record<string, string> = { SIN_FALLA: "Sin Falla", CON_FALLA: "Con Falla", SIN_DIAGNOSTICO: "Sin Diagnóstico" };
                return (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Scrap por Razón de Diagnóstico</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Tipo Scrap</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Último Diagnóstico</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Última Falla</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700">Cantidad</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scrapByReason.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-2 px-3">{row.scrapType}</td>
                            <td className="py-2 px-3">
                              <span className={row.diagnostico === "CON_FALLA" ? "text-red-600 font-medium" : row.diagnostico === "SIN_FALLA" ? "text-green-600 font-medium" : "text-gray-400"}>
                                {DIAG_LABELS[row.diagnostico] || row.diagnostico}
                              </span>
                            </td>
                            <td className="py-2 px-3">{row.falla}</td>
                            <td className="py-2 px-3 text-right font-medium">{row.cantidad.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{total > 0 ? `${(row.cantidad / total * 100).toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="py-2 px-3" colSpan={3}>Total</td>
                          <td className="py-2 px-3 text-right">{total.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
