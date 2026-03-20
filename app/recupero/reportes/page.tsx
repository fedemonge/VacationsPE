"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

type ReportTab = "burned" | "agents" | "effectiveness" | "outside-peru" | "missing-coords";

interface BurnedRecord {
  id: string;
  nombreUsuario: string | null;
  direccion: string | null;
  agenteCampo: string;
  tipoBase: string | null;
  grupo: string | null;
  departamento: string | null;
  distanciaMetros: number | null;
  contrato: string | null;
  fechaCierre: string | null;
}

interface AgentRecord {
  agenteCampo: string;
  departamento?: string | null;
  total: number;
  exitosas: number;
  noExitosas: number;
  quemadas: number;
  tasaExito: number;
  tasaQuemadas: number;
}

interface OutsidePeruRecord {
  id: string;
  nombreUsuario: string | null;
  direccion: string | null;
  departamento: string | null;
  latitud: number | null;
  longitud: number | null;
  agenteCampo: string;
  tipoBase: string | null;
}

interface MissingCoordsRecord {
  id: string;
  nombreUsuario: string | null;
  direccion: string | null;
  departamento: string | null;
  agenteCampo: string;
  estado: string | null;
  tipoBase: string | null;
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: "effectiveness", label: "Efectividad" },
  { key: "burned", label: "Quemadas" },
  { key: "agents", label: "Agentes" },
  { key: "outside-peru", label: "Fuera de Peru" },
  { key: "missing-coords", label: "Sin Coordenadas" },
];

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const YEARS = [2025, 2026, 2027];

export default function RecuperoReportesPage() {
  const { authenticated, email } = useAuth();

  const now = new Date();
  const [activeTab, setActiveTab] = useState<ReportTab>("effectiveness");
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState("");
  const [agente, setAgente] = useState("");
  const [tipoBase, setTipoBase] = useState("");
  const [grupo, setGrupo] = useState("");
  const [esAgendado, setEsAgendado] = useState("");
  const [departamento, setDepartamento] = useState("");

  // Filter options (loaded from data)
  const [agentes, setAgentes] = useState<string[]>([]);
  const [tiposBase, setTiposBase] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [departamentos, setDepartamentos] = useState<string[]>([]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("periodoYear", String(year));
    params.set("periodoMonth", String(month));
    if (day) params.set("day", day);
    if (agente) params.set("agenteCampo", agente);
    if (tipoBase) params.set("tipoBase", tipoBase);
    if (grupo) params.set("grupo", grupo);
    if (esAgendado) params.set("esAgendado", esAgendado);
    if (departamento) params.set("departamento", departamento);
    return params.toString();
  }, [year, month, day, agente, tipoBase, grupo, esAgendado, departamento]);

  // Load filter options
  useEffect(() => {
    fetch(`/api/recupero/filters?year=${year}&month=${month}`)
      .then(r => r.ok ? r.json() : { agentes: [], tiposBase: [], grupos: [] })
      .then(d => {
        setAgentes(d.agentes || []);
        setTiposBase(d.tiposBase || []);
        setGrupos(d.grupos || []);
        setDepartamentos(d.departamentos || []);
      })
      .catch(() => {});
  }, [year, month]);

  const loadReport = useCallback(async (tab: ReportTab) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await fetch(`/api/recupero/reportes?type=${tab}&${qs}`);
      if (!res.ok) throw new Error("Error al cargar reporte");
      const json = await res.json();
      setData(json.tasks || json.agents || json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    loadReport(activeTab);
  }, [activeTab, loadReport]);

  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab);
  };

  const exportToExcel = () => {
    if (data.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);

    const tabLabel = TABS.find((t) => t.key === activeTab)?.label || activeTab;
    XLSX.writeFile(wb, `Recupero_${tabLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return d; }
  };

  const renderBurnedTable = (records: BurnedRecord[]) => (
    <table className="min-w-full divide-y divide-gray-200 text-xs">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Fecha</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Agente</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Depto</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Grupo</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Usuario</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Tipo</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Dirección</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">Distancia</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {records.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{fmtDate(r.fechaCierre)}</td>
            <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.agenteCampo}</td>
            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.departamento || "—"}</td>
            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.grupo || "—"}</td>
            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.nombreUsuario || "—"}</td>
            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.tipoBase || "—"}</td>
            <td className="px-2 py-1.5 text-gray-600 max-w-[220px] truncate">{r.direccion || "—"}</td>
            <td className="px-2 py-1.5 text-right text-red-600 font-medium">
              {r.distanciaMetros != null
                ? r.distanciaMetros >= 1000
                  ? `${(r.distanciaMetros / 1000).toFixed(1)} km`
                  : `${Math.round(r.distanciaMetros)} m`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderAgentsTable = (records: AgentRecord[]) => (
    <table className="min-w-full divide-y divide-gray-200 text-xs">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Agente</th>
          <th className="px-2 py-2 text-left font-medium text-gray-500">Depto</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">Total</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">Exit.</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">No Exit.</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">Quem.</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">% Exito</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">Equipos</th>
          <th className="px-2 py-2 text-right font-medium text-gray-500">F.Uso</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {records.map((r) => {
          const total = r.total ?? 0;
          const exitosas = r.exitosas ?? 0;
          const noExitosas = r.noExitosas ?? 0;
          const quemadas = r.quemadas ?? 0;
          const tasa = r.tasaExito ?? 0;
          const equipos = (r as AgentRecord & { equipos?: number }).equipos ?? 0;
          const factorUso = (r as AgentRecord & { factorDeUso?: number }).factorDeUso ?? 0;
          return (
            <tr key={r.agenteCampo} className="hover:bg-gray-50">
              <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.agenteCampo}</td>
              <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.departamento || "—"}</td>
              <td className="px-2 py-1.5 text-right text-gray-900 font-medium">{total.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right text-green-700 font-medium">{exitosas.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right text-red-600">{noExitosas.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right text-gray-600">{quemadas.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    tasa >= 70
                      ? "bg-green-100 text-green-800"
                      : tasa >= 40
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {tasa.toFixed(1)}%
                </span>
              </td>
              <td className="px-2 py-1.5 text-right text-blue-700 font-medium">{equipos.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right text-blue-600 font-medium">{factorUso.toFixed(1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderOutsidePeruTable = (records: OutsidePeruRecord[]) => (
    <table className="min-w-full divide-y divide-gray-200 text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Depto</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Dirección</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Agente</th>
          <th className="px-4 py-3 text-right font-medium text-gray-500">Latitud</th>
          <th className="px-4 py-3 text-right font-medium text-gray-500">Longitud</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {records.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.nombreUsuario}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.departamento || "—"}</td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.direccion}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.agenteCampo}</td>
            <td className="px-4 py-3 text-right text-gray-600">{r.latitud?.toFixed(6) ?? "—"}</td>
            <td className="px-4 py-3 text-right text-gray-600">{r.longitud?.toFixed(6) ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderMissingCoordsTable = (records: MissingCoordsRecord[]) => (
    <table className="min-w-full divide-y divide-gray-200 text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Depto</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Dirección</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Agente</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Estado</th>
          <th className="px-4 py-3 text-left font-medium text-gray-500">Tipo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {records.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.nombreUsuario}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.departamento || "—"}</td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.direccion}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.agenteCampo}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.estado}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.tipoBase}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderEffectivenessTable = (records: AgentRecord[]) => (
    <>
      <table className="min-w-full divide-y divide-gray-200 text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left font-medium text-gray-500">Agente</th>
            <th className="px-2 py-2 text-left font-medium text-gray-500">Depto</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">Total</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">Efect.</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">Exit.</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">No Exit.*</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">Quem.</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">Equipos</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500">F.Uso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {records.map((r) => {
            const total = r.total ?? 0;
            const exitosas = r.exitosas ?? 0;
            const quemadas = r.quemadas ?? 0;
            const noExInclQ = total - exitosas;
            const efectividad = total > 0 ? (exitosas / total) * 100 : 0;
            const equipos = (r as AgentRecord & { equipos?: number }).equipos ?? 0;
            const factorUso = (r as AgentRecord & { factorDeUso?: number }).factorDeUso ?? 0;
            return (
              <tr key={r.agenteCampo} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.agenteCampo}</td>
                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{(r as AgentRecord & { departamento?: string }).departamento || "—"}</td>
                <td className="px-2 py-1.5 text-right text-gray-900 font-bold">{total.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-14 bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${efectividad >= 50 ? "bg-green-500" : efectividad >= 25 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(efectividad, 100)}%` }}
                      />
                    </div>
                    <span className={`font-bold ${efectividad >= 50 ? "text-green-700" : efectividad >= 25 ? "text-yellow-700" : "text-red-700"}`}>
                      {efectividad.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right text-green-700 font-medium">{exitosas.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-red-600">{noExInclQ.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-gray-800 font-medium">{quemadas.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-blue-700 font-medium">{equipos.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-blue-600 font-medium">{factorUso.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-gray-400 border-t">
        * No Exitosas incluye Quemadas. Quemadas = gestión no exitosa con cierre a {">"} 500m del punto de visita.
        {" "}Total Asignadas = Exitosas + No Exitosas. Efectividad = Exitosas / Total Asignadas.
      </p>
    </>
  );

  const renderTable = () => {
    if (data.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>No hay datos para este reporte.</p>
        </div>
      );
    }

    switch (activeTab) {
      case "effectiveness":
        return renderEffectivenessTable(data as AgentRecord[]);
      case "burned":
        return renderBurnedTable(data as BurnedRecord[]);
      case "agents":
        return renderAgentsTable(data as AgentRecord[]);
      case "outside-peru":
        return renderOutsidePeruTable(data as OutsidePeruRecord[]);
      case "missing-coords":
        return renderMissingCoordsTable(data as MissingCoordsRecord[]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/recupero"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes de Recupero</h1>
            <p className="text-gray-500 text-sm mt-1">
              Análisis detallado por categoría
            </p>
          </div>
        </div>
        <div className="flex gap-2">
        <Link
          href="/recupero/reportes/agente"
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
        >
          Reporte por Agente
        </Link>
        <button
          onClick={exportToExcel}
          disabled={data.length === 0 || loading}
          className="px-4 py-2 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Exportar Excel
        </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Día</label>
            <select value={day} onChange={e => setDay(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agente</label>
            <select value={agente} onChange={e => setAgente(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {agentes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo Base</label>
            <select value={tipoBase} onChange={e => setTipoBase(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {tiposBase.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Grupo</label>
            <select value={grupo} onChange={e => setGrupo(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Departamento</label>
            <select value={departamento} onChange={e => setDepartamento(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agendamiento</label>
            <select value={esAgendado} onChange={e => setEsAgendado(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              <option value="true">Agendado</option>
              <option value="false">No Agendado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-[#EA7704] text-[#EA7704]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Table Content */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EA7704]" />
          </div>
        ) : (
          <div className="overflow-x-auto">{renderTable()}</div>
        )}

        {/* Record count footer */}
        {!loading && data.length > 0 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-500">
            {data.length.toLocaleString()} registro{data.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
