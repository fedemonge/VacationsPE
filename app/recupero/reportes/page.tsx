"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

type ReportTab = "burned" | "agents" | "effectiveness" | "outside-peru" | "missing-coords";

interface DetailRecord {
  id: string;
  agenteCampo: string;
  contrato: string | null;
  cedulaUsuario: string | null;
  nombreUsuario: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  tipoBase: string | null;
  grupo: string | null;
  estado: string | null;
  tipoCierre: string | null;
  fechaCierre: string | null;
  distanciaMetros: number | null;
  equiposRecuperados: number | null;
  esQuemada: boolean;
  esAgendado: boolean;
  coordStatus: string | null;
}

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
  const [gestionables, setGestionables] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // Drill-down modal
  const [drillDown, setDrillDown] = useState<{
    open: boolean;
    title: string;
    records: DetailRecord[];
    loading: boolean;
  }>({ open: false, title: "", records: [], loading: false });

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
      setGestionables(json.gestionables || {});
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

  const openDrillDown = async (filterType: "agenteCampo" | "departamento", value: string) => {
    setDrillDown({ open: true, title: value, records: [], loading: true });
    try {
      const qs = buildQuery();
      const res = await fetch(`/api/recupero/reportes/detalle?${filterType}=${encodeURIComponent(value)}&${qs}`);
      if (!res.ok) throw new Error("Error al cargar detalle");
      const json = await res.json();
      setDrillDown((prev) => ({ ...prev, records: json.tasks || [], loading: false }));
    } catch {
      setDrillDown((prev) => ({ ...prev, records: [], loading: false }));
    }
  };

  const exportDrillDownExcel = () => {
    if (drillDown.records.length === 0) return;
    const exportData = drillDown.records.map((r) => ({
      Fecha: r.fechaCierre ? new Date(r.fechaCierre).toLocaleDateString("es-PE") : "",
      Agente: r.agenteCampo,
      Departamento: r.departamento || "",
      Contrato: r.contrato || "",
      Cedula: r.cedulaUsuario || "",
      Usuario: r.nombreUsuario || "",
      Direccion: r.direccion || "",
      Ciudad: r.ciudad || "",
      TipoBase: r.tipoBase || "",
      Grupo: r.grupo || "",
      Estado: r.estado || "",
      TipoCierre: r.tipoCierre || "",
      "Distancia (m)": r.distanciaMetros != null ? Math.round(r.distanciaMetros) : "",
      Equipos: r.equiposRecuperados ?? 0,
      Quemada: r.esQuemada ? "Sí" : "No",
      Agendado: r.esAgendado ? "Sí" : "No",
      Coordenadas: r.coordStatus || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle");
    XLSX.writeFile(wb, `Recupero_Detalle_${drillDown.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <td className="px-2 py-1.5 font-medium whitespace-nowrap">
              <button
                onClick={() => openDrillDown("agenteCampo", r.agenteCampo)}
                className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2 font-medium"
                title={`Ver detalle de ${r.agenteCampo}`}
              >
                {r.agenteCampo}
              </button>
            </td>
            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
              {r.departamento ? (
                <button
                  onClick={() => openDrillDown("departamento", r.departamento!)}
                  className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                  title={`Ver detalle de ${r.departamento}`}
                >
                  {r.departamento}
                </button>
              ) : "—"}
            </td>
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
              <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                <button
                  onClick={() => openDrillDown("agenteCampo", r.agenteCampo)}
                  className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2 font-medium"
                  title={`Ver detalle de ${r.agenteCampo}`}
                >
                  {r.agenteCampo}
                </button>
              </td>
              <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                {r.departamento ? (
                  <button
                    onClick={() => openDrillDown("departamento", r.departamento!)}
                    className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                    title={`Ver detalle de ${r.departamento}`}
                  >
                    {r.departamento}
                  </button>
                ) : "—"}
              </td>
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
            <td className="px-4 py-3 whitespace-nowrap">
              {r.departamento ? (
                <button
                  onClick={() => openDrillDown("departamento", r.departamento!)}
                  className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                  title={`Ver detalle de ${r.departamento}`}
                >
                  {r.departamento}
                </button>
              ) : "—"}
            </td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.direccion}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              <button
                onClick={() => openDrillDown("agenteCampo", r.agenteCampo)}
                className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                title={`Ver detalle de ${r.agenteCampo}`}
              >
                {r.agenteCampo}
              </button>
            </td>
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
            <td className="px-4 py-3 whitespace-nowrap">
              {r.departamento ? (
                <button
                  onClick={() => openDrillDown("departamento", r.departamento!)}
                  className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                  title={`Ver detalle de ${r.departamento}`}
                >
                  {r.departamento}
                </button>
              ) : "—"}
            </td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.direccion}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              <button
                onClick={() => openDrillDown("agenteCampo", r.agenteCampo)}
                className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2"
                title={`Ver detalle de ${r.agenteCampo}`}
              >
                {r.agenteCampo}
              </button>
            </td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.estado}</td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.tipoBase}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const toggleDept = (dept: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept); else next.add(dept);
      return next;
    });
  };

  const renderEffectivenessTable = (records: AgentRecord[]) => {
    type ExtAgent = AgentRecord & { equipos?: number; factorDeUso?: number };

    // Group by department
    const deptMap = new Map<string, ExtAgent[]>();
    for (const r of records) {
      const dept = (r as ExtAgent & { departamento?: string }).departamento || "SIN DEPARTAMENTO";
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(r as ExtAgent);
    }

    const deptSummaries = Array.from(deptMap.entries()).map(([dept, agents]) => {
      const total = agents.reduce((s, a) => s + (a.total ?? 0), 0);
      const exitosas = agents.reduce((s, a) => s + (a.exitosas ?? 0), 0);
      const quemadas = agents.reduce((s, a) => s + (a.quemadas ?? 0), 0);
      const equipos = agents.reduce((s, a) => s + (a.equipos ?? 0), 0);
      const efectividad = total > 0 ? (exitosas / total) * 100 : 0;
      const factorUso = exitosas > 0 ? Math.round((equipos / exitosas) * 10) / 10 : 0;
      const gest = gestionables[dept] ?? 0;
      agents.sort((a, b) => (b.exitosas ?? 0) - (a.exitosas ?? 0));
      return { dept, agents, total, exitosas, noExitosas: total - exitosas, quemadas, equipos, efectividad, factorUso, gestionables: gest };
    });
    deptSummaries.sort((a, b) => b.total - a.total);

    const deptNames = deptSummaries.map((d) => d.dept);
    const allExpanded = deptNames.every((d) => expandedDepts.has(d));
    const totalGest = deptSummaries.reduce((s, d) => s + d.gestionables, 0);

    return (
      <>
        <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {deptSummaries.length} departamento{deptSummaries.length !== 1 ? "s" : ""} &middot; {records.length} agente{records.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setExpandedDepts(allExpanded ? new Set() : new Set(deptNames))}
            className="text-xs text-[#EA7704] hover:text-[#d06a03] font-medium"
          >
            {allExpanded ? "Colapsar todos" : "Expandir todos"}
          </button>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-500 w-8"></th>
              <th className="px-2 py-2 text-left font-medium text-gray-500">Departamento / Agente</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Gestionables**</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Total</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">% Gest.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Efect.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Exit.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">No Exit.*</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Quem.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Equipos</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">F.Uso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deptSummaries.map((ds) => {
              const isExpanded = expandedDepts.has(ds.dept);
              return (
                <Fragment key={ds.dept}>
                  <tr className="bg-gray-50 hover:bg-gray-100 cursor-pointer select-none" onClick={() => toggleDept(ds.dept)}>
                    <td className="px-2 py-2 text-center">
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                    <td className="px-2 py-2 font-bold text-gray-900 whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); openDrillDown("departamento", ds.dept); }}
                        className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2 font-bold"
                        title={`Ver detalle de ${ds.dept}`}
                      >
                        {ds.dept}
                      </button>
                      <span className="ml-2 text-[10px] font-normal text-gray-500">({ds.agents.length} agente{ds.agents.length !== 1 ? "s" : ""})</span>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-orange-600">{ds.gestionables > 0 ? ds.gestionables.toLocaleString() : "—"}</td>
                    <td className="px-2 py-2 text-right text-gray-900 font-bold">{ds.total.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">
                      {(() => { const base = ds.gestionables + ds.total; const pct = base > 0 ? (ds.total / base) * 100 : 0; return (
                        <span className={`font-bold ${pct >= 80 ? "text-green-700" : pct >= 50 ? "text-yellow-700" : "text-red-700"}`}>{pct.toFixed(1)}%</span>
                      ); })()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-14 bg-gray-300 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${ds.efectividad >= 50 ? "bg-green-500" : ds.efectividad >= 25 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(ds.efectividad, 100)}%` }} />
                        </div>
                        <span className={`font-bold ${ds.efectividad >= 50 ? "text-green-700" : ds.efectividad >= 25 ? "text-yellow-700" : "text-red-700"}`}>{ds.efectividad.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-green-700 font-bold">{ds.exitosas.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-red-600 font-bold">{ds.noExitosas.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-gray-800 font-bold">{ds.quemadas.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-blue-700 font-bold">{ds.equipos.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-blue-600 font-bold">{ds.factorUso.toFixed(1)}</td>
                  </tr>
                  {isExpanded && ds.agents.map((r) => {
                    const total = r.total ?? 0;
                    const exitosas = r.exitosas ?? 0;
                    const quemadas = r.quemadas ?? 0;
                    const noExInclQ = total - exitosas;
                    const efectividad = total > 0 ? (exitosas / total) * 100 : 0;
                    const equipos = r.equipos ?? 0;
                    const factorUso = r.factorDeUso ?? 0;
                    return (
                      <tr key={r.agenteCampo} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 pl-8 font-medium whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); openDrillDown("agenteCampo", r.agenteCampo); }}
                            className="text-[#EA7704] hover:text-[#d06a03] underline decoration-dotted underline-offset-2 font-medium"
                            title={`Ver detalle de ${r.agenteCampo}`}
                          >
                            {r.agenteCampo}
                          </button>
                        </td>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 text-right text-gray-900 font-bold">{total.toLocaleString()}</td>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <div className="w-14 bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${efectividad >= 50 ? "bg-green-500" : efectividad >= 25 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(efectividad, 100)}%` }} />
                            </div>
                            <span className={`font-bold ${efectividad >= 50 ? "text-green-700" : efectividad >= 25 ? "text-yellow-700" : "text-red-700"}`}>{efectividad.toFixed(1)}%</span>
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
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold text-xs">
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2">TOTAL</td>
              <td className="px-2 py-2 text-right text-orange-600">{totalGest.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{deptSummaries.reduce((s, d) => s + d.total, 0).toLocaleString()}</td>
              <td className="px-2 py-2 text-right">
                {(() => { const t = deptSummaries.reduce((s, d) => s + d.total, 0); const base = totalGest + t; return base > 0 ? (t / base * 100).toFixed(1) + "%" : "0%"; })()}
              </td>
              <td className="px-2 py-2 text-right">
                {(() => { const t = deptSummaries.reduce((s, d) => s + d.total, 0); const e = deptSummaries.reduce((s, d) => s + d.exitosas, 0); return t > 0 ? (e / t * 100).toFixed(1) + "%" : "0%"; })()}
              </td>
              <td className="px-2 py-2 text-right text-green-700">{deptSummaries.reduce((s, d) => s + d.exitosas, 0).toLocaleString()}</td>
              <td className="px-2 py-2 text-right text-red-600">{deptSummaries.reduce((s, d) => s + d.noExitosas, 0).toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{deptSummaries.reduce((s, d) => s + d.quemadas, 0).toLocaleString()}</td>
              <td className="px-2 py-2 text-right text-blue-700">{deptSummaries.reduce((s, d) => s + d.equipos, 0).toLocaleString()}</td>
              <td className="px-2 py-2 text-right text-blue-600">
                {(() => { const e = deptSummaries.reduce((s, d) => s + d.exitosas, 0); const eq = deptSummaries.reduce((s, d) => s + d.equipos, 0); return e > 0 ? (eq / e).toFixed(1) : "0"; })()}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="px-4 py-2 text-[10px] text-gray-400 border-t">
          * No Exitosas incluye Quemadas. Quemadas = gestión no exitosa con cierre a {">"} 500m del punto de visita.
          {" "}** Gestionables = clientes únicos de los últimos 3 meses calendario con último estado aún gestionable (no recuperado, no fraude, incluyendo quemadas). No se afecta por los filtros de periodo.
        </p>
      </>
    );
  };

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

      {/* Drill-down Modal */}
      {drillDown.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] flex flex-col m-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Detalle: {drillDown.title}</h2>
                {!drillDown.loading && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {drillDown.records.length.toLocaleString()} registro{drillDown.records.length !== 1 ? "s" : ""}
                    {" — "}{MONTHS[month - 1]} {year}{day ? `, día ${day}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportDrillDownExcel}
                  disabled={drillDown.records.length === 0 || drillDown.loading}
                  className="px-3 py-1.5 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Exportar Excel
                </button>
                <button
                  onClick={() => setDrillDown({ open: false, title: "", records: [], loading: false })}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-auto flex-1">
              {drillDown.loading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EA7704]" />
                </div>
              ) : drillDown.records.length === 0 ? (
                <div className="text-center py-16 text-gray-500">No hay registros.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Fecha</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Agente</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Depto</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Contrato</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Usuario</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Dirección</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Ciudad</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Tipo Base</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Grupo</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Tipo Cierre</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Dist. (m)</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Equipos</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">Quem.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {drillDown.records.map((r) => {
                      const isSuccess = r.tipoCierre?.toUpperCase().includes("RECUPERADO WODEN");
                      return (
                        <tr key={r.id} className={`hover:bg-gray-50 ${r.esQuemada ? "bg-red-50/50" : ""}`}>
                          <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{fmtDate(r.fechaCierre)}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.agenteCampo}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.departamento || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.contrato || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.nombreUsuario || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 max-w-[180px] truncate" title={r.direccion || ""}>{r.direccion || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.ciudad || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.tipoBase || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.grupo || "—"}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isSuccess ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                            }`}>
                              {r.tipoCierre || "—"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-600">
                            {r.distanciaMetros != null
                              ? r.distanciaMetros >= 1000
                                ? `${(r.distanciaMetros / 1000).toFixed(1)}k`
                                : `${Math.round(r.distanciaMetros)}`
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-700 font-medium">{r.equiposRecuperados ?? 0}</td>
                          <td className="px-2 py-1.5 text-center">
                            {r.esQuemada && <span className="text-red-500 font-bold text-[10px]">QUEM</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
