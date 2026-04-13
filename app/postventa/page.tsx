"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, LabelList,
} from "recharts";

const COLORS = ["#EA7704", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#eab308"];

interface Stats {
  totalOrdenes: number;
  abiertas: number;
  cerradas: number;
  gestionables: number;
  noGestionables: number;
  cumplimientoTatGarantia: number;
  cumplimientoTatWoden: number;
  cumplimientoTatLab: number;
  tatPromedioGarantia: number;
  tatPromedioWoden: number;
  tatPromedioLab: number;
  porEstadoOperativo: { estado: string; cantidad: number }[];
  porMarca: { marca: string; cantidad: number }[];
  porSegmento: { segmento: string; cantidad: number }[];
}

interface Filters {
  segmentos: string[];
  marcas: string[];
  ciudades: string[];
  zonas: string[];
  estadosOrden: string[];
  cierresOds: string[];
  gestionables: string[];
  sucursales: string[];
  canales: string[];
  paises: string[];
  anos: number[];
  meses: number[];
}

interface Orden {
  id: string;
  odsNumero: string;
  imei: string;
  marca: string;
  modelo: string;
  segmento: string;
  sucursal: string;
  cierreOdsxEstado: string;
  estadoOperativo: string;
  estadoOrden?: string;
  tatGarantiasCalc: number | null;
  cumplTatGarantiaCalc: boolean | null;
  ingreso: string;
}

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function PostventaDashboard() {
  const now = new Date();
  const [anoIng, setAnoIng] = useState<string>("");
  const [mesIng, setMesIng] = useState<string>("");
  const [segmento, setSegmento] = useState("");
  const [marca, setMarca] = useState("");
  const [ciudadHomologada, setCiudadHomologada] = useState("");
  const [tipoDeZona, setTipoDeZona] = useState("");
  const [estadoOrden, setEstadoOrden] = useState("");
  const [cierreOdsxEstado, setCierreOdsxEstado] = useState("");
  const [gestionable, setGestionable] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [canal, setCanal] = useState("");
  const [pais, setPais] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [volumeChart, setVolumeChart] = useState<unknown[]>([]);
  const [complianceChart, setComplianceChart] = useState<unknown[]>([]);
  const [subprocessChart, setSubprocessChart] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (anoIng) params.set("anoIng", anoIng);
    if (mesIng) params.set("mesIng", mesIng);
    if (segmento) params.set("segmento", segmento);
    if (marca) params.set("marca", marca);
    if (ciudadHomologada) params.set("ciudadHomologada", ciudadHomologada);
    if (tipoDeZona) params.set("tipoDeZona", tipoDeZona);
    if (estadoOrden) params.set("estadoOrden", estadoOrden);
    if (cierreOdsxEstado) params.set("cierreOdsxEstado", cierreOdsxEstado);
    if (gestionable) params.set("gestionable", gestionable);
    if (sucursal) params.set("sucursal", sucursal);
    if (canal) params.set("canal", canal);
    if (pais) params.set("pais", pais);
    return params.toString();
  }, [anoIng, mesIng, segmento, marca, ciudadHomologada, tipoDeZona, estadoOrden, cierreOdsxEstado, gestionable, sucursal, canal, pais]);

  // Load filters once
  useEffect(() => {
    fetch("/api/postventa/filters")
      .then((r) => r.json())
      .then(setFilters)
      .catch(() => {});
  }, []);

  // Load data on filter change
  useEffect(() => {
    setLoading(true);
    const qs = buildParams();

    Promise.all([
      fetch(`/api/postventa/stats?${qs}`).then((r) => r.json()),
      fetch(`/api/postventa?${qs}&page=${page}&limit=50`).then((r) => r.json()),
      fetch(`/api/postventa/chart?${qs}&type=volume-trend`).then((r) => r.json()),
      fetch(`/api/postventa/chart?${qs}&type=tat-compliance`).then((r) => r.json()),
      fetch(`/api/postventa/chart?${qs}&type=subprocess`).then((r) => r.json()),
    ])
      .then(([statsData, ordenesData, volData, complData, subData]) => {
        setStats(statsData);
        setOrdenes(ordenesData.ordenes || []);
        setTotal(ordenesData.total || 0);
        setVolumeChart(volData.chartData || []);
        setComplianceChart(complData.chartData || []);
        setSubprocessChart(subData.chartData || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [buildParams, page]);

  const FilterSelect = ({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: string[];
  }) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => { onChange(e.target.value); setPage(1); }}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
      >
        <option value="">Todos</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const KpiCard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || "#1f2937" }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );

  // Build compliance chart: pivot by segmento for lines
  const complianceByPeriod: Record<string, Record<string, unknown>> = {};
  const complianceSegmentos = new Set<string>();
  for (const d of complianceChart as { periodo: string; segmento: string; cumplimiento: number }[]) {
    if (!complianceByPeriod[d.periodo]) complianceByPeriod[d.periodo] = { periodo: d.periodo };
    complianceByPeriod[d.periodo][d.segmento] = d.cumplimiento;
    complianceSegmentos.add(d.segmento);
  }
  const compliancePivot = Object.values(complianceByPeriod).sort((a, b) =>
    String(a.periodo).localeCompare(String(b.periodo))
  );
  const segList = Array.from(complianceSegmentos);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Postventa</h1>
          <p className="text-gray-500 text-sm mt-1">Servicio técnico postventa - Órdenes de servicio</p>
        </div>
        <div className="flex gap-2">
          <Link href="/postventa/importar" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: "#EA7704" }}>
            Importar
          </Link>
          <Link href="/postventa/reportes" className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
            Reportes
          </Link>
          <Link href="/postventa/configuracion" className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
            Configuración
          </Link>
        </div>
      </div>

      {/* Filters */}
      {filters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Año</label>
              <select value={anoIng} onChange={(e) => { setAnoIng(e.target.value); setPage(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-400">
                <option value="">Todos</option>
                {filters.anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mes</label>
              <select value={mesIng} onChange={(e) => { setMesIng(e.target.value); setPage(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-400">
                <option value="">Todos</option>
                {filters.meses.map((m) => <option key={m} value={m}>{MONTH_NAMES[m]} ({m})</option>)}
              </select>
            </div>
            <FilterSelect label="Operador" value={segmento} onChange={setSegmento} options={filters.segmentos} />
            <FilterSelect label="Marca" value={marca} onChange={setMarca} options={filters.marcas} />
            <FilterSelect label="Ciudad" value={ciudadHomologada} onChange={setCiudadHomologada} options={filters.ciudades} />
            <FilterSelect label="Zona" value={tipoDeZona} onChange={setTipoDeZona} options={filters.zonas} />
            <FilterSelect label="Estado Orden" value={estadoOrden} onChange={setEstadoOrden} options={filters.estadosOrden} />
            <FilterSelect label="Cierre ODS" value={cierreOdsxEstado} onChange={setCierreOdsxEstado} options={filters.cierresOds} />
            <FilterSelect label="Gestionable" value={gestionable} onChange={setGestionable} options={filters.gestionables} />
            <FilterSelect label="Sucursal" value={sucursal} onChange={setSucursal} options={filters.sucursales} />
            <FilterSelect label="Canal" value={canal} onChange={setCanal} options={filters.canales} />
            <FilterSelect label="País" value={pais} onChange={setPais} options={filters.paises} />
          </div>
        </div>
      )}

      {loading && !stats && (
        <div className="text-center py-12 text-gray-500">Cargando datos...</div>
      )}

      {stats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            <KpiCard label="Total Órdenes" value={stats.totalOrdenes.toLocaleString()} />
            <KpiCard label="Abiertas" value={stats.abiertas.toLocaleString()} color="#ef4444" />
            <KpiCard label="Cerradas" value={stats.cerradas.toLocaleString()} color="#22c55e" />
            <KpiCard label="Gestionables" value={stats.gestionables.toLocaleString()} color="#3b82f6" />
            <KpiCard label="% TAT Garantía" value={`${stats.cumplimientoTatGarantia}%`}
              color={stats.cumplimientoTatGarantia >= 80 ? "#22c55e" : stats.cumplimientoTatGarantia >= 60 ? "#eab308" : "#ef4444"} />
            <KpiCard label="% TAT Woden" value={`${stats.cumplimientoTatWoden}%`}
              color={stats.cumplimientoTatWoden >= 80 ? "#22c55e" : stats.cumplimientoTatWoden >= 60 ? "#eab308" : "#ef4444"} />
            <KpiCard label="Prom TAT Garantía" value={`${stats.tatPromedioGarantia}d`} sub="días" />
            <KpiCard label="Prom TAT Woden" value={`${stats.tatPromedioWoden}d`} sub="días" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Volume Trend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Volumen por Período</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={volumeChart as Record<string, unknown>[]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cerradas" name="Cerradas" fill="#22c55e" stackId="a">
                    <LabelList dataKey="cerradas" position="center" fontSize={9} fill="#fff" />
                  </Bar>
                  <Bar dataKey="abiertas" name="Abiertas" fill="#ef4444" stackId="a">
                    <LabelList dataKey="abiertas" position="center" fontSize={9} fill="#fff" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* TAT Compliance Trend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Cumplimiento TAT Garantía por Operador</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={compliancePivot}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Legend />
                  {segList.map((seg, i) => (
                    <Line key={seg} type="monotone" dataKey={seg} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2} dot={{ r: 3 }} connectNulls>
                      <LabelList dataKey={seg} position="top" fontSize={9} fill={COLORS[i % COLORS.length]} formatter={(v: number) => `${v}%`} />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sub-process Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tiempo Promedio por Sub-proceso (días)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subprocessChart as Record<string, unknown>[]} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="etapa" type="category" width={180} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="promedio" name="Promedio (días)">
                  <LabelList dataKey="promedio" position="right" fontSize={10} fill="#333" formatter={(v: number) => `${v}d`} />
                  {(subprocessChart as { promedio: number }[]).map((entry, i) => (
                    <Cell key={i} fill={entry.promedio === Math.max(...(subprocessChart as { promedio: number }[]).map(e => e.promedio)) ? "#ef4444" : "#EA7704"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Por Operador</h3>
              {stats.porSegmento.map((s) => (
                <div key={s.segmento} className="flex justify-between py-1 text-sm border-b border-gray-50">
                  <span className="text-gray-600">{s.segmento}</span>
                  <span className="font-medium">{s.cantidad.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Por Marca</h3>
              {stats.porMarca.slice(0, 8).map((m) => (
                <div key={m.marca} className="flex justify-between py-1 text-sm border-b border-gray-50">
                  <span className="text-gray-600">{m.marca}</span>
                  <span className="font-medium">{m.cantidad.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Por Estado Operativo</h3>
              {stats.porEstadoOperativo.map((e) => (
                <div key={e.estado} className="flex justify-between py-1 text-sm border-b border-gray-50">
                  <span className="text-gray-600">{e.estado}</span>
                  <span className="font-medium">{e.cantidad.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Órdenes de Servicio ({total.toLocaleString()})
              </h3>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-30">Anterior</button>
                <span className="text-xs text-gray-500 self-center">Pág {page} de {Math.ceil(total / 50) || 1}</span>
                <button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 50)}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-30">Siguiente</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">ODS</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">IMEI</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Marca</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Modelo</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Operador</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Sucursal</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Estado</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600">TAT Garantía</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Cumple</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 px-2 font-mono">{o.odsNumero}</td>
                      <td className="py-1.5 px-2 font-mono">{o.imei?.replace("IMEI: ", "")}</td>
                      <td className="py-1.5 px-2">{o.marca?.replace(" (P)", "")}</td>
                      <td className="py-1.5 px-2 truncate max-w-[200px]">{o.modelo?.replace(" (P)", "")}</td>
                      <td className="py-1.5 px-2">{o.segmento}</td>
                      <td className="py-1.5 px-2 truncate max-w-[150px]">{o.sucursal}</td>
                      <td className="py-1.5 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          o.cierreOdsxEstado === "CERRADO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {o.estadoOperativo || o.estadoOrden}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {o.tatGarantiasCalc !== null ? `${o.tatGarantiasCalc}d` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {o.cumplTatGarantiaCalc === null ? "—" : o.cumplTatGarantiaCalc ? (
                          <span className="text-green-600 font-bold">Si</span>
                        ) : (
                          <span className="text-red-600 font-bold">No</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-gray-500">
                        {o.ingreso ? new Date(o.ingreso).toLocaleDateString("es-PE") : "—"}
                      </td>
                    </tr>
                  ))}
                  {ordenes.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-400">
                        No hay datos. Importe un archivo desde la sección de importación.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
