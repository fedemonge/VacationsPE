"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import type { RecuperoTask } from "@/components/recupero/RecuperoMap";

const RecuperoMap = dynamic(() => import("@/components/recupero/RecuperoMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
      Cargando mapa...
    </div>
  ),
});

interface RecuperoStats {
  total: number;
  exitosas: number;
  noExitosas: number;
  quemadas: number;
  sinCoords: number;
  fueraDePeru: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const YEARS = [2024, 2025, 2026];
const PAGE_SIZE = 25;

function getStatusBadge(estado: string, esQuemada: boolean): { label: string; classes: string } {
  if (esQuemada) return { label: "Quemada", classes: "bg-gray-900 text-white" };
  switch (estado) {
    case "AGENDADA":
      return { label: "Agendada", classes: "bg-yellow-100 text-yellow-800" };
    case "EXITOSA":
      return { label: "Exitosa", classes: "bg-green-100 text-green-800" };
    case "NO_EXITOSA":
      return { label: "No Exitosa", classes: "bg-red-100 text-red-800" };
    default:
      return { label: estado, classes: "bg-gray-100 text-gray-800" };
  }
}

export default function RecuperoDashboardPage() {
  const { authenticated, email, role } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [tipoBase, setTipoBase] = useState("");
  const [agente, setAgente] = useState("");
  const [grupo, setGrupo] = useState("");
  const [coordStatus, setCoordStatus] = useState("");
  const [esAgendado, setEsAgendado] = useState("");
  const [day, setDay] = useState("");

  const [tasks, setTasks] = useState<RecuperoTask[]>([]);
  const [mapTasks, setMapTasks] = useState<RecuperoTask[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [stats, setStats] = useState<RecuperoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Unique filter options derived from tasks
  const [agentes, setAgentes] = useState<string[]>([]);
  const [tiposBase, setTiposBase] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [tiposCierre, setTiposCierre] = useState<string[]>([]);
  const [tipoCierre, setTipoCierre] = useState("");

  // Charts
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
  const [hourlyData, setHourlyData] = useState<Record<string, unknown>[]>([]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("periodoYear", String(year));
    params.set("periodoMonth", String(month));
    if (tipoBase) params.set("tipoBase", tipoBase);
    if (agente) params.set("agenteCampo", agente);
    if (grupo) params.set("grupo", grupo);
    if (coordStatus) params.set("coordStatus", coordStatus);
    if (esAgendado) params.set("esAgendado", esAgendado);
    if (tipoCierre) params.set("tipoCierre", tipoCierre);
    if (day) params.set("day", day);
    return params.toString();
  }, [year, month, day, tipoBase, agente, grupo, coordStatus, esAgendado, tipoCierre]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildParams();
      // Fetch table data (paginated 50) + stats + map data (up to 5000 for pins)
      const [tasksRes, statsRes, mapRes] = await Promise.all([
        fetch(`/api/recupero?${qs}&limit=50`),
        fetch(`/api/recupero/stats?${qs}`),
        fetch(`/api/recupero?${qs}&limit=5000`),
      ]);

      if (!tasksRes.ok || !statsRes.ok) {
        throw new Error("Error al cargar datos de recupero");
      }

      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      const mapData = mapRes.ok ? await mapRes.json() : { tasks: [] };

      setTasks(tasksData.tasks || []);
      setMapTasks(mapData.tasks || []);
      setStats(statsData);
      setTotalRecords(tasksData.total || 0);
      setPage(1);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Load filter options (distinct values from DB)
  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch(`/api/recupero/filters?year=${year}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setAgentes(data.agentes || []);
        setTiposBase(data.tiposBase || []);
        setGrupos(data.grupos || []);
        setTiposCierre(data.tiposCierre || []);
      }
    } catch { /* ignore */ }
  }, [year, month]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load chart data (uses same filters as the rest of the page)
  useEffect(() => {
    const qs = buildParams();
    fetch(`/api/recupero/chart?${qs}`)
      .then(r => r.ok ? r.json() : { chartData: [] })
      .then(d => setChartData(d.chartData || []))
      .catch(() => setChartData([]));
    fetch(`/api/recupero/chart-hourly?${qs}`)
      .then(r => r.ok ? r.json() : { chartData: [] })
      .then(d => setHourlyData(d.chartData || []))
      .catch(() => setHourlyData([]));
  }, [buildParams]);

  // Pagination (server-side — tasks already limited to 50)
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const paginatedTasks = tasks;

  // KPI card helper
  const kpiCard = (label: string, value: number, color: string, sub?: string) => (
    <div className={`rounded-lg border p-4 ${color}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recupero</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestión de visitas y recupero de servicios
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/recupero/importar"
            className="px-4 py-2 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] transition-colors text-sm font-medium"
          >
            Importar
          </Link>
          <Link
            href="/recupero/reportes"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Reportes
          </Link>
        </div>
      </div>

      {/* Period & Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-9 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Día</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo Base</label>
            <select
              value={tipoBase}
              onChange={(e) => setTipoBase(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              {tiposBase.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agente</label>
            <select
              value={agente}
              onChange={(e) => setAgente(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              {agentes.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Grupo</label>
            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              {grupos.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Coordenadas</label>
            <select
              value={coordStatus}
              onChange={(e) => setCoordStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              <option value="con">Con coordenadas</option>
              <option value="sin">Sin coordenadas</option>
              <option value="fuera">Fuera de Peru</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Resultado</label>
            <select
              value={tipoCierre}
              onChange={(e) => setTipoCierre(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              {tiposCierre.map((tc) => (
                <option key={tc} value={tc}>{tc}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agendamiento</label>
            <select
              value={esAgendado}
              onChange={(e) => setEsAgendado(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-[#EA7704] focus:border-[#EA7704]"
            >
              <option value="">Todos</option>
              <option value="true">Agendado</option>
              <option value="false">No Agendado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (() => {
        const t = stats.total || 1;
        const pct = (v: number) => `${((v / t) * 100).toFixed(1)}%`;
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              {kpiCard("Total Gestiones", stats.total, "bg-white", "Exitosas + No Exitosas")}
              {kpiCard("Exitosas", stats.exitosas, "bg-green-50", pct(stats.exitosas))}
              {kpiCard("No Exitosas", stats.noExitosas, "bg-red-50", `${pct(stats.noExitosas)} · incl. quemadas`)}
              {kpiCard("Quemadas", stats.quemadas, "bg-gray-100", `${pct(stats.quemadas)} · subset de No Exitosas`)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
              {kpiCard("Sin Coords", stats.sinCoords, "bg-yellow-50", pct(stats.sinCoords))}
              {kpiCard("Fuera de Peru", stats.fueraDePeru, "bg-orange-50", pct(stats.fueraDePeru))}
              {kpiCard("Con Coords Válidas", stats.total - stats.sinCoords - stats.fueraDePeru, "bg-blue-50", pct(stats.total - stats.sinCoords - stats.fueraDePeru))}
            </div>
            <p className="text-[10px] text-gray-400 mb-6">
              Total = Exitosas ({stats.exitosas.toLocaleString()}) + No Exitosas ({stats.noExitosas.toLocaleString()}) = {(stats.exitosas + stats.noExitosas).toLocaleString()}
              {" · "}Quemadas ({stats.quemadas.toLocaleString()}) son un subconjunto de No Exitosas (cierre a {">"} 500m del destino)
            </p>
          </>
        );
      })()}

      {/* Effectiveness Chart */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Efectividad Diaria{agente ? ` — ${agente}` : " — Todos los agentes"}
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="right" dataKey="agentExitosas" name="Exitosas" fill="#22C55E" stackId="stack" barSize={20}>
                <LabelList dataKey="agentExitosas" position="inside" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} />
              </Bar>
              <Bar yAxisId="right" dataKey="agentNoExitosas" name="No Exitosas" fill="#EF4444" stackId="stack" barSize={20}>
                <LabelList dataKey="agentNoExitosas" position="inside" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} />
              </Bar>
              <Line yAxisId="left" type="monotone" dataKey="companyEfectividad" name="Efectividad Compañía" stroke="#EA7704" strokeWidth={2} dot={{ r: 3 }}>
                <LabelList dataKey="companyEfectividad" position="top" style={{ fontSize: 10, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
              </Line>
              {agente && (
                <Line yAxisId="left" type="monotone" dataKey="agentEfectividad" name={`Efectividad ${agente.split(" ")[0]}`} stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="agentEfectividad" position="bottom" style={{ fontSize: 10, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
                </Line>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
        )}
      </div>

      {/* Hourly Distribution Chart */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Distribución Horaria de Cierres{agente ? ` — ${agente}` : ""}
        </h3>
        {hourlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={hourlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="exitosas" name="Exitosas" fill="#22C55E" stackId="stack" barSize={24}>
                <LabelList dataKey="exitosas" position="inside" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="noExitosas" name="No Exitosas" fill="#EF4444" stackId="stack" barSize={24}>
                <LabelList dataKey="noExitosas" position="inside" style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
        )}
      </div>

      {/* Map */}
      {!loading && tasks.length > 0 && (
        <div className="mb-6">
          <RecuperoMap tasks={mapTasks} stats={stats || undefined} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EA7704]" />
        </div>
      )}

      {/* Data Table */}
      {!loading && tasks.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Dirección</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Agente</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Grupo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Distancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedTasks.map((task) => {
                  const badge = getStatusBadge(task.estado, task.esQuemada);
                  return (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {task.nombreUsuario}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {task.direccion}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {task.agenteCampo}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {task.tipoBase}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {task.grupo}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {task.distanciaMetros != null
                          ? task.distanciaMetros >= 1000
                            ? `${(task.distanciaMetros / 1000).toFixed(1)} km`
                            : `${Math.round(task.distanciaMetros)} m`
                          : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-sm text-gray-500">
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tasks.length)} de{" "}
                {tasks.length}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Anterior
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1 border rounded text-sm ${
                        page === pageNum
                          ? "bg-[#EA7704] text-white border-[#EA7704]"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">No hay datos de recupero</p>
          <p className="mt-1">
            Importa un archivo para comenzar o ajusta los filtros.
          </p>
        </div>
      )}
    </div>
  );
}
