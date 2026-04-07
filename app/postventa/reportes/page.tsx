"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Tab = "tat-adherence" | "aging" | "subprocess" | "operator";

interface TatRow {
  label: string;
  total: number;
  pctGarantia: number | null;
  pctWoden: number | null;
  pctLab: number | null;
  avgTatGarantia: number | null;
  avgTatWoden: number | null;
  avgTatLab: number | null;
}

interface TatGroup extends TatRow {
  children: TatRow[];
}

interface AgingRow {
  label: string;
  total: number;
  [key: string]: string | number;
}

interface AgingGroup extends AgingRow {
  children: AgingRow[];
}

interface Filters {
  segmentos: string[];
  marcas: string[];
  ciudades: string[];
  zonas: string[];
  estadosOrden: string[];
  cierresOds: string[];
  gestionables: string[];
  paises: string[];
  anos: number[];
  meses: number[];
}

export default function PostventaReportesPage() {
  const [tab, setTab] = useState<Tab>("tat-adherence");
  const [filters, setFilters] = useState<Filters | null>(null);
  const [anoIng, setAnoIng] = useState("");
  const [mesIng, setMesIng] = useState("");
  const [segmento, setSegmento] = useState("");
  const [marca, setMarca] = useState("");
  const [ciudadHomologada, setCiudad] = useState("");
  const [tipoDeZona, setTipoDeZona] = useState("");
  const [estadoOrden, setEstadoOrden] = useState("");
  const [cierreOdsxEstado, setCierreOdsxEstado] = useState("");
  const [gestionable, setGestionable] = useState("");
  const [pais, setPais] = useState("");
  const [groupBy, setGroupBy] = useState<"operador" | "marca">("operador");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [tatData, setTatData] = useState<{ byOperador: TatGroup[]; byMarca: TatGroup[]; openCount: number; asOfDate: string } | null>(null);
  const [agingData, setAgingData] = useState<{ byOperador: AgingGroup[]; byMarca: AgingGroup[]; buckets: { key: string; label: string; min: number; max: number }[]; asOfDate: string } | null>(null);
  const [agingGroupBy, setAgingGroupBy] = useState<"operador" | "marca">("operador");
  const [agingExpanded, setAgingExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [drillDown, setDrillDown] = useState<{ title: string; rows: Record<string, unknown>[]; loading: boolean } | null>(null);

  const openDrillDown = async (title: string, filterOverrides: Record<string, string>) => {
    setDrillDown({ title, rows: [], loading: true });
    const p = new URLSearchParams();
    if (anoIng) p.set("anoIng", anoIng);
    if (mesIng) p.set("mesIng", mesIng);
    if (segmento) p.set("segmento", segmento);
    if (marca) p.set("marca", marca);
    if (ciudadHomologada) p.set("ciudadHomologada", ciudadHomologada);
    if (tipoDeZona) p.set("tipoDeZona", tipoDeZona);
    if (estadoOrden) p.set("estadoOrden", estadoOrden);
    if (cierreOdsxEstado) p.set("cierreOdsxEstado", cierreOdsxEstado);
    if (gestionable) p.set("gestionable", gestionable);
    if (pais) p.set("pais", pais);
    for (const [k, v] of Object.entries(filterOverrides)) p.set(k, v);
    try {
      const res = await fetch(`/api/postventa/reportes/detalle?${p.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setDrillDown({ title, rows: json.data || [], loading: false });
      } else {
        setDrillDown(null);
      }
    } catch { setDrillDown(null); }
  };

  const exportDrillDownXlsx = () => {
    if (!drillDown || drillDown.rows.length === 0) return;
    const headers = Object.keys(drillDown.rows[0]);
    const csv = "\uFEFF" + [headers.join(","), ...drillDown.rows.map((r) => headers.map((h) => {
      const v = r[h] ?? "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postventa-detalle-${drillDown.title.replace(/[^a-zA-Z0-9]/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetch("/api/postventa/filters").then((r) => r.json()).then(setFilters).catch(() => {});
  }, []);

  const buildQs = () => {
    const p = new URLSearchParams();
    if (anoIng) p.set("anoIng", anoIng);
    if (mesIng) p.set("mesIng", mesIng);
    if (segmento) p.set("segmento", segmento);
    if (marca) p.set("marca", marca);
    if (ciudadHomologada) p.set("ciudadHomologada", ciudadHomologada);
    if (tipoDeZona) p.set("tipoDeZona", tipoDeZona);
    if (estadoOrden) p.set("estadoOrden", estadoOrden);
    if (cierreOdsxEstado) p.set("cierreOdsxEstado", cierreOdsxEstado);
    if (gestionable) p.set("gestionable", gestionable);
    if (pais) p.set("pais", pais);
    return p.toString();
  };

  // Serialize filter state into a single string to avoid stale closures
  const filterKey = [tab, anoIng, mesIng, segmento, marca, ciudadHomologada, tipoDeZona, estadoOrden, cierreOdsxEstado, gestionable, pais].join("|");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = buildQs();

    fetch(`/api/postventa/reportes?type=${tab}&${qs}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (cancelled || !json) return;
        if (tab === "tat-adherence") {
          setTatData({ byOperador: json.byOperador || [], byMarca: json.byMarca || [], openCount: json.openCount || 0, asOfDate: json.asOfDate || "" });
        } else if (tab === "aging") {
          setAgingData({ byOperador: json.byOperador || [], byMarca: json.byMarca || [], buckets: json.buckets || [], asOfDate: json.asOfDate || "" });
        } else {
          setData(json.data || []);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const pctColor = (v: number | null) => {
    if (v === null) return "text-gray-400";
    if (v >= 80) return "text-green-700 bg-green-50";
    if (v >= 60) return "text-yellow-700 bg-yellow-50";
    return "text-red-700 bg-red-50";
  };

  const exportXlsx = () => {
    // Simple CSV export
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `postventa-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reportes Postventa</h1>
          <p className="text-gray-500 text-sm mt-1">Análisis de TAT, envejecimiento y sub-procesos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXlsx} className="px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">
            Exportar CSV
          </button>
          <Link href="/postventa" className="px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      {filters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Año</label>
              <select value={anoIng} onChange={(e) => setAnoIng(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mes</label>
              <select value={mesIng} onChange={(e) => setMesIng(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.meses.map((m) => <option key={m} value={m}>{MONTH_NAMES[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Operador</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Marca</label>
              <select value={marca} onChange={(e) => setMarca(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todas</option>
                {filters.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ciudad</label>
              <select value={ciudadHomologada} onChange={(e) => setCiudad(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todas</option>
                {filters.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Zona</label>
              <select value={tipoDeZona} onChange={(e) => setTipoDeZona(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todas</option>
                {filters.zonas.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estado Orden</label>
              <select value={estadoOrden} onChange={(e) => setEstadoOrden(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.estadosOrden.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cierre ODS</label>
              <select value={cierreOdsxEstado} onChange={(e) => setCierreOdsxEstado(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.cierresOds.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gestionable</label>
              <select value={gestionable} onChange={(e) => setGestionable(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.gestionables.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">País</label>
              <select value={pais} onChange={(e) => setPais(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">Todos</option>
                {filters.paises.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          ["tat-adherence", "Cumplimiento TAT"],
          ["aging", "Envejecimiento"],
          ["subprocess", "Sub-procesos"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === key ? "bg-white shadow text-gray-800" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-gray-500">Cargando...</div>}

      {/* TAT Adherence Tab */}
      {!loading && tab === "tat-adherence" && tatData && (() => {
        const groups = groupBy === "operador" ? tatData.byOperador : tatData.byMarca;
        const parentLabel = groupBy === "operador" ? "Operador" : "Marca";
        const childLabel = groupBy === "operador" ? "Marca" : "Operador";
        const toggleExpand = (label: string) => {
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
          });
        };
        const TatCells = ({ row }: { row: TatRow }) => (
          <>
            <td className="py-2 px-3 text-right">{row.total.toLocaleString()}</td>
            <td className={`py-2 px-3 text-right font-medium rounded ${pctColor(row.pctGarantia)}`}>
              {row.pctGarantia !== null ? `${row.pctGarantia}%` : "—"}
            </td>
            <td className={`py-2 px-3 text-right font-medium rounded ${pctColor(row.pctWoden)}`}>
              {row.pctWoden !== null ? `${row.pctWoden}%` : "—"}
            </td>
            <td className={`py-2 px-3 text-right font-medium rounded ${pctColor(row.pctLab)}`}>
              {row.pctLab !== null ? `${row.pctLab}%` : "—"}
            </td>
            <td className="py-2 px-3 text-right">{row.avgTatGarantia !== null ? `${row.avgTatGarantia}d` : "—"}</td>
            <td className="py-2 px-3 text-right">{row.avgTatWoden !== null ? `${row.avgTatWoden}d` : "—"}</td>
            <td className="py-2 px-3 text-right">{row.avgTatLab !== null ? `${row.avgTatLab}d` : "—"}</td>
          </>
        );
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Cumplimiento TAT</h3>
              <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as "operador" | "marca"); setExpanded(new Set()); }}
                className="border rounded-lg px-3 py-1 text-sm">
                <option value="operador">Por Operador</option>
                <option value="marca">Por Marca</option>
              </select>
              <button onClick={() => setExpanded(expanded.size === groups.length ? new Set() : new Set(groups.map((g) => g.label)))}
                className="text-xs text-blue-600 hover:text-blue-800">
                {expanded.size === groups.length ? "Colapsar todo" : "Expandir todo"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">{parentLabel}</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Total</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">% TAT Garantía</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">% TAT Woden</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">% TAT Lab</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Prom Garantía</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Prom Woden</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Prom Lab</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Totals row */}
                  {groups.length > 0 && (() => {
                    const t = { total: 0, sumGar: 0, cntGar: 0, sumWod: 0, cntWod: 0, sumLab: 0, cntLab: 0, cumGar: 0, totGar: 0, cumWod: 0, totWod: 0, cumLab: 0, totLab: 0 };
                    for (const g of groups) {
                      t.total += g.total;
                      if (g.pctGarantia !== null) { t.cumGar += Math.round(g.pctGarantia * g.total / 100); t.totGar += g.total; }
                      if (g.pctWoden !== null) { t.cumWod += Math.round(g.pctWoden * g.total / 100); t.totWod += g.total; }
                      if (g.pctLab !== null) { t.cumLab += Math.round(g.pctLab * g.total / 100); t.totLab += g.total; }
                      if (g.avgTatGarantia !== null) { t.sumGar += g.avgTatGarantia * g.total; t.cntGar += g.total; }
                      if (g.avgTatWoden !== null) { t.sumWod += g.avgTatWoden * g.total; t.cntWod += g.total; }
                      if (g.avgTatLab !== null) { t.sumLab += g.avgTatLab * g.total; t.cntLab += g.total; }
                    }
                    const pG = t.totGar > 0 ? Math.round((t.cumGar / t.totGar) * 1000) / 10 : null;
                    const pW = t.totWod > 0 ? Math.round((t.cumWod / t.totWod) * 1000) / 10 : null;
                    const pL = t.totLab > 0 ? Math.round((t.cumLab / t.totLab) * 1000) / 10 : null;
                    const aG = t.cntGar > 0 ? Math.round((t.sumGar / t.cntGar) * 10) / 10 : null;
                    const aW = t.cntWod > 0 ? Math.round((t.sumWod / t.cntWod) * 10) / 10 : null;
                    const aL = t.cntLab > 0 ? Math.round((t.sumLab / t.cntLab) * 10) / 10 : null;
                    return (
                      <tr className="border-b-2 border-gray-300 bg-gray-100 font-bold">
                        <td className="py-2.5 px-3">
                          <button onClick={() => openDrillDown("TOTAL", {})}
                            className="text-blue-700 hover:text-blue-900 hover:underline font-bold">
                            TOTAL
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right">{t.total.toLocaleString()}</td>
                        <td className={`py-2.5 px-3 text-right rounded ${pctColor(pG)}`}>{pG !== null ? `${pG}%` : "—"}</td>
                        <td className={`py-2.5 px-3 text-right rounded ${pctColor(pW)}`}>{pW !== null ? `${pW}%` : "—"}</td>
                        <td className={`py-2.5 px-3 text-right rounded ${pctColor(pL)}`}>{pL !== null ? `${pL}%` : "—"}</td>
                        <td className="py-2.5 px-3 text-right">{aG !== null ? `${aG}d` : "—"}</td>
                        <td className="py-2.5 px-3 text-right">{aW !== null ? `${aW}d` : "—"}</td>
                        <td className="py-2.5 px-3 text-right">{aL !== null ? `${aL}d` : "—"}</td>
                      </tr>
                    );
                  })()}
                  {groups.map((group) => {
                    const parentFilterKey = groupBy === "operador" ? "segmento" : "marca";
                    const childFilterKey = groupBy === "operador" ? "marca" : "segmento";
                    return (
                      <>
                        <tr key={group.label} className="border-b border-gray-200 bg-gray-50 hover:bg-gray-100">
                          <td className="py-2 px-3 font-semibold">
                            <span className="inline-block w-4 text-gray-400 mr-1 cursor-pointer" onClick={() => toggleExpand(group.label)}>
                              {expanded.has(group.label) ? "▼" : "▶"}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); openDrillDown(group.label, { [parentFilterKey]: group.label }); }}
                              className="text-blue-700 hover:text-blue-900 hover:underline font-semibold">
                              {group.label}
                            </button>
                            <span className="text-xs text-gray-400 ml-2 cursor-pointer" onClick={() => toggleExpand(group.label)}>
                              ({group.children.length} {childLabel.toLowerCase()}s)
                            </span>
                          </td>
                          <TatCells row={group} />
                        </tr>
                        {expanded.has(group.label) && group.children.map((child) => (
                          <tr key={`${group.label}-${child.label}`} className="border-b border-gray-50 hover:bg-orange-50">
                            <td className="py-1.5 px-3 pl-10">
                              <button onClick={() => openDrillDown(`${group.label} / ${child.label}`, { [parentFilterKey]: group.label, [childFilterKey]: child.label })}
                                className="text-blue-600 hover:text-blue-800 hover:underline">
                                {child.label}
                              </button>
                            </td>
                            <TatCells row={child} />
                          </tr>
                        ))}
                      </>
                    );
                  })}
                  {groups.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-gray-400">No hay datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {tatData.openCount > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                * Las {tatData.openCount.toLocaleString()} ordenes abiertas se calculan asumiendo cierre al {new Date(tatData.asOfDate).toLocaleDateString("es-PE")}. Los valores reales pueden variar al momento del cierre efectivo.
              </div>
            )}
          </div>
        );
      })()}

      {/* Aging Tab */}
      {!loading && tab === "aging" && agingData && (() => {
        const groups = agingGroupBy === "operador" ? agingData.byOperador : agingData.byMarca;
        const parentLabel = agingGroupBy === "operador" ? "Operador" : "Marca";
        const childLabel = agingGroupBy === "operador" ? "Marca" : "Operador";
        const buckets = agingData.buckets;
        const parentFilterKey = agingGroupBy === "operador" ? "segmento" : "marca";
        const childFilterKey = agingGroupBy === "operador" ? "marca" : "segmento";

        const toggleAgingExpand = (label: string) => {
          setAgingExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
          });
        };

        // Color intensity based on count
        const cellColor = (count: number, bucketIdx: number) => {
          if (count === 0) return "";
          if (bucketIdx >= 8) return "bg-red-200 text-red-900 font-bold";
          if (bucketIdx >= 7) return "bg-red-100 text-red-800 font-semibold";
          if (bucketIdx >= 5) return "bg-orange-100 text-orange-800";
          return "bg-yellow-50 text-yellow-800";
        };

        // Totals row
        const totals: Record<string, number> = { total: 0 };
        for (const b of buckets) totals[b.key] = 0;
        for (const g of groups) {
          totals.total += g.total;
          for (const b of buckets) totals[b.key] += (g[b.key] as number) || 0;
        }

        const AgingCells = ({ row, filters: f }: { row: AgingRow; filters: Record<string, string> }) => (
          <>
            {buckets.map((b, bi) => {
              const count = (row[b.key] as number) || 0;
              return (
                <td key={b.key} className={`py-2 px-2 text-center ${cellColor(count, bi)}`}>
                  {count > 0 ? (
                    <button onClick={() => openDrillDown(`${row.label} / ${b.label}`, { ...f, agingMin: String(b.min), agingMax: String(b.max) })}
                      className="hover:underline">{count}</button>
                  ) : <span className="text-gray-300">0</span>}
                </td>
              );
            })}
          </>
        );

        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Envejecimiento</h3>
              <select value={agingGroupBy} onChange={(e) => { setAgingGroupBy(e.target.value as "operador" | "marca"); setAgingExpanded(new Set()); }}
                className="border rounded-lg px-3 py-1 text-sm">
                <option value="operador">Por Operador</option>
                <option value="marca">Por Marca</option>
              </select>
              <button onClick={() => setAgingExpanded(agingExpanded.size === groups.length ? new Set() : new Set(groups.map((g) => g.label)))}
                className="text-xs text-blue-600 hover:text-blue-800">
                {agingExpanded.size === groups.length ? "Colapsar todo" : "Expandir todo"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">{parentLabel}</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600">Total</th>
                    {buckets.map((b) => (
                      <th key={b.key} className="text-center py-2 px-2 font-medium text-gray-600">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Totals row */}
                  <tr className="border-b-2 border-gray-300 bg-gray-100 font-bold">
                    <td className="py-2.5 px-3">
                      <button onClick={() => openDrillDown("TOTAL", {})} className="text-blue-700 hover:text-blue-900 hover:underline font-bold">TOTAL</button>
                    </td>
                    <td className="py-2.5 px-2 text-right">{totals.total}</td>
                    {buckets.map((b, bi) => {
                      const count = totals[b.key] || 0;
                      return (
                        <td key={b.key} className={`py-2.5 px-2 text-center ${cellColor(count, bi)}`}>
                          {count > 0 ? (
                            <button onClick={() => openDrillDown(`TOTAL / ${b.label}`, { agingMin: String(b.min), agingMax: String(b.max) })}
                              className="hover:underline">{count}</button>
                          ) : <span className="text-gray-300">0</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {groups.map((group) => (
                    <>
                      <tr key={group.label} className="border-b border-gray-200 bg-gray-50 hover:bg-gray-100">
                        <td className="py-2 px-3 font-semibold">
                          <span className="inline-block w-4 text-gray-400 mr-1 cursor-pointer" onClick={() => toggleAgingExpand(group.label)}>
                            {agingExpanded.has(group.label) ? "▼" : "▶"}
                          </span>
                          <button onClick={() => openDrillDown(group.label, { [parentFilterKey]: group.label })}
                            className="text-blue-700 hover:text-blue-900 hover:underline font-semibold">{group.label}</button>
                          <span className="text-xs text-gray-400 ml-2 cursor-pointer" onClick={() => toggleAgingExpand(group.label)}>
                            ({group.children.length} {childLabel.toLowerCase()}s)
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-medium">{group.total}</td>
                        <AgingCells row={group} filters={{ [parentFilterKey]: group.label }} />
                      </tr>
                      {agingExpanded.has(group.label) && group.children.map((child) => (
                        <tr key={`${group.label}-${child.label}`} className="border-b border-gray-50 hover:bg-orange-50">
                          <td className="py-1.5 px-3 pl-10">
                            <button onClick={() => openDrillDown(`${group.label} / ${child.label}`, { [parentFilterKey]: group.label, [childFilterKey]: child.label })}
                              className="text-blue-600 hover:text-blue-800 hover:underline">{child.label}</button>
                          </td>
                          <td className="py-1.5 px-2 text-right">{child.total}</td>
                          <AgingCells row={child} filters={{ [parentFilterKey]: group.label, [childFilterKey]: child.label }} />
                        </tr>
                      ))}
                    </>
                  ))}
                  {groups.length === 0 && (
                    <tr><td colSpan={2 + buckets.length} className="py-6 text-center text-gray-400">No hay órdenes abiertas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              * Días calendario desde ingreso al {new Date(agingData.asOfDate).toLocaleDateString("es-PE")}
            </div>
          </div>
        );
      })()}

      {/* Sub-process Tab */}
      {!loading && tab === "subprocess" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Análisis de Sub-procesos</h3>
          <div className="mb-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data as Record<string, unknown>[]} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="etapa" type="category" width={200} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="promedio" name="Promedio (días)">
                  <LabelList dataKey="promedio" position="right" fontSize={10} fill="#333" formatter={(v: number) => `${v}d`} />
                  {(data as { isBottleneck?: boolean }[]).map((entry, i) => (
                    <Cell key={i} fill={entry.isBottleneck ? "#ef4444" : "#EA7704"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Etapa</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Promedio</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Mediana</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Mínimo</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Máximo</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Registros</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Cuello de Botella</th>
                </tr>
              </thead>
              <tbody>
                {(data as { etapa: string; promedio: number; mediana: number; minimo: number; maximo: number; cantidad: number; isBottleneck: boolean }[]).map((row) => (
                  <tr key={row.etapa} className={`border-b border-gray-50 ${row.isBottleneck ? "bg-red-50" : "hover:bg-gray-50"}`}>
                    <td className="py-2 px-3 font-medium">{row.etapa}</td>
                    <td className="py-2 px-3 text-right font-mono">{row.promedio}d</td>
                    <td className="py-2 px-3 text-right font-mono">{row.mediana}d</td>
                    <td className="py-2 px-3 text-right font-mono">{row.minimo}d</td>
                    <td className="py-2 px-3 text-right font-mono">{row.maximo}d</td>
                    <td className="py-2 px-3 text-right">{row.cantidad.toLocaleString()}</td>
                    <td className="py-2 px-3 text-center">
                      {row.isBottleneck && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Cuello de botella</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operator Tab */}
      {!loading && tab === "operator" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumen por Operador</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(data as { segmento: string; total: number; abiertas: number; cerradas: number; gestionables: number; pctCumplGarantia: number | null; pctCumplWoden: number | null; avgTatGarantia: number | null; avgTatWoden: number | null }[]).map((op) => (
              <div key={op.segmento} className="border border-gray-200 rounded-xl p-4">
                <h4 className="font-semibold text-gray-800 mb-3">{op.segmento}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">Total</div>
                  <div className="text-right font-medium">{op.total.toLocaleString()}</div>
                  <div className="text-gray-500">Abiertas</div>
                  <div className="text-right font-medium text-red-600">{op.abiertas}</div>
                  <div className="text-gray-500">Cerradas</div>
                  <div className="text-right font-medium text-green-600">{op.cerradas}</div>
                  <div className="text-gray-500">Gestionables</div>
                  <div className="text-right font-medium">{op.gestionables}</div>
                  <div className="col-span-2 border-t mt-1 pt-1"></div>
                  <div className="text-gray-500">% TAT Garantía</div>
                  <div className={`text-right font-bold ${pctColor(op.pctCumplGarantia)} px-1 rounded`}>
                    {op.pctCumplGarantia !== null ? `${op.pctCumplGarantia}%` : "—"}
                  </div>
                  <div className="text-gray-500">% TAT Woden</div>
                  <div className={`text-right font-bold ${pctColor(op.pctCumplWoden)} px-1 rounded`}>
                    {op.pctCumplWoden !== null ? `${op.pctCumplWoden}%` : "—"}
                  </div>
                  <div className="text-gray-500">Prom TAT Garantía</div>
                  <div className="text-right font-medium">{op.avgTatGarantia !== null ? `${op.avgTatGarantia}d` : "—"}</div>
                  <div className="text-gray-500">Prom TAT Woden</div>
                  <div className="text-right font-medium">{op.avgTatWoden !== null ? `${op.avgTatWoden}d` : "—"}</div>
                </div>
              </div>
            ))}
            {data.length === 0 && (
              <div className="col-span-3 py-6 text-center text-gray-400">No hay datos</div>
            )}
          </div>
        </div>
      )}

      {/* Drill-Down Modal */}
      {drillDown && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Detalle: {drillDown.title}</h2>
                <p className="text-xs text-gray-500">{drillDown.rows.length.toLocaleString()} ordenes</p>
              </div>
              <div className="flex gap-2">
                <button onClick={exportDrillDownXlsx} disabled={drillDown.loading || drillDown.rows.length === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#EA7704" }}>
                  Exportar Excel
                </button>
                <button onClick={() => setDrillDown(null)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 px-2">
              {drillDown.loading ? (
                <div className="py-12 text-center text-gray-500">Cargando detalle...</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b bg-gray-50">
                      {drillDown.rows.length > 0 && Object.keys(drillDown.rows[0]).map((h) => (
                        <th key={h} className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1 px-2 whitespace-nowrap">{v !== null && v !== undefined ? String(v) : ""}</td>
                        ))}
                      </tr>
                    ))}
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
