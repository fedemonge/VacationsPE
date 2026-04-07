"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface TatConfig {
  id: string;
  segmento: string;
  tatMaximoGarantia: number;
  tatObjetivoWoden: number;
  tatObjetivoLab: number;
  consideraSabados: boolean;
  consideraDomingos: boolean;
  consideraFeriados: boolean;
  isActive: boolean;
}

interface Feriado {
  id: string;
  fecha: string;
  nombre: string;
  pais: string;
  isActive: boolean;
}

export default function PostventaConfiguracionPage() {
  const [tab, setTab] = useState<"tat" | "feriados">("tat");
  const [configs, setConfigs] = useState<TatConfig[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [editingConfig, setEditingConfig] = useState<Partial<TatConfig> | null>(null);
  const [newFeriado, setNewFeriado] = useState({ fecha: "", nombre: "" });
  const [recalcProgress, setRecalcProgress] = useState<{ processed: number; total: number; done: boolean; phase: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [segmentos, setSegmentos] = useState<string[]>([]);

  const loadConfigs = useCallback(async () => {
    const res = await fetch("/api/postventa/configuracion");
    if (res.ok) { const data = await res.json(); setConfigs(data.configs || []); }
  }, []);

  const loadFeriados = useCallback(async () => {
    const res = await fetch("/api/postventa/feriados");
    if (res.ok) { const data = await res.json(); setFeriados(data.feriados || []); }
  }, []);

  const loadSegmentos = useCallback(async () => {
    const res = await fetch("/api/postventa/filters");
    if (res.ok) { const data = await res.json(); setSegmentos(data.segmentos || []); }
  }, []);

  useEffect(() => { loadConfigs(); loadFeriados(); loadSegmentos(); }, [loadConfigs, loadFeriados, loadSegmentos]);

  // TAT Config handlers
  const saveConfig = async () => {
    if (!editingConfig?.segmento) return;
    setMsg(null);
    const method = editingConfig.id ? "PATCH" : "POST";
    const res = await fetch("/api/postventa/configuracion", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingConfig),
    });
    if (res.ok) { setEditingConfig(null); loadConfigs(); setMsg("Configuración guardada"); }
    else { const e = await res.json(); setMsg(e.error || "Error"); }
  };

  const handleRecalculate = async () => {
    if (!confirm("¿Recalcular TATs para todas las órdenes con la configuración actual?")) return;
    const res = await fetch("/api/postventa/recalcular", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) { setMsg("Error al iniciar recálculo"); return; }
    const { progressId } = await res.json();
    setRecalcProgress({ processed: 0, total: 0, done: false, phase: "Iniciando..." });

    const interval = setInterval(async () => {
      const r = await fetch(`/api/postventa/recalcular?progressId=${progressId}`);
      if (r.ok) {
        const p = await r.json();
        setRecalcProgress(p);
        if (p.done) { clearInterval(interval); setMsg(p.phase); }
      }
    }, 1000);
  };

  // Feriado handlers
  const addFeriado = async () => {
    if (!newFeriado.fecha || !newFeriado.nombre) return;
    const res = await fetch("/api/postventa/feriados", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFeriado),
    });
    if (res.ok) { setNewFeriado({ fecha: "", nombre: "" }); loadFeriados(); }
    else { const e = await res.json(); setMsg(e.error); }
  };

  const deleteFeriado = async (id: string) => {
    await fetch(`/api/postventa/feriados/${id}`, { method: "DELETE" });
    loadFeriados();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configuración Postventa</h1>
          <p className="text-gray-500 text-sm mt-1">TAT por operador y feriados</p>
        </div>
        <Link href="/postventa" className="px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">
          ← Dashboard
        </Link>
      </div>

      {msg && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {msg}
          <button onClick={() => setMsg(null)} className="ml-2 text-blue-500">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("tat")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "tat" ? "bg-white shadow text-gray-800" : "text-gray-500"}`}>
          TAT por Operador
        </button>
        <button onClick={() => setTab("feriados")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "feriados" ? "bg-white shadow text-gray-800" : "text-gray-500"}`}>
          Feriados ({feriados.length})
        </button>
      </div>

      {/* TAT Config Tab */}
      {tab === "tat" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">TAT por Operador</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditingConfig({ tatMaximoGarantia: 5, tatObjetivoWoden: 3, tatObjetivoLab: 1, consideraSabados: false, consideraDomingos: false, consideraFeriados: false })}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: "#EA7704" }}>
                + Agregar
              </button>
              <button onClick={handleRecalculate}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-orange-400 text-orange-600 hover:bg-orange-50">
                Recalcular TATs
              </button>
            </div>
          </div>

          {recalcProgress && !recalcProgress.done && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{recalcProgress.phase}</span>
                <span>{recalcProgress.total > 0 ? Math.round((recalcProgress.processed / recalcProgress.total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="h-2 rounded-full" style={{
                  width: `${recalcProgress.total > 0 ? (recalcProgress.processed / recalcProgress.total) * 100 : 0}%`,
                  backgroundColor: "#EA7704"
                }} />
              </div>
            </div>
          )}

          {/* Config editing modal */}
          {editingConfig && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Operador (Segmento)</label>
                  {editingConfig.id ? (
                    <input type="text" value={editingConfig.segmento || ""} disabled
                      className="w-full border rounded-lg px-3 py-1.5 text-sm bg-gray-100 text-gray-500" />
                  ) : (
                    <select value={editingConfig.segmento || ""} onChange={(e) => setEditingConfig({ ...editingConfig, segmento: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm">
                      <option value="">Seleccionar operador</option>
                      {segmentos.filter((s) => !configs.some((c) => c.segmento === s)).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TAT Máximo Garantía (días)</label>
                  <input type="number" step="0.5" value={editingConfig.tatMaximoGarantia || 0} onChange={(e) => setEditingConfig({ ...editingConfig, tatMaximoGarantia: parseFloat(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TAT Objetivo Woden (días)</label>
                  <input type="number" step="0.5" value={editingConfig.tatObjetivoWoden || 0} onChange={(e) => setEditingConfig({ ...editingConfig, tatObjetivoWoden: parseFloat(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TAT Objetivo Lab (días)</label>
                  <input type="number" step="0.5" value={editingConfig.tatObjetivoLab || 0} onChange={(e) => setEditingConfig({ ...editingConfig, tatObjetivoLab: parseFloat(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-6 mb-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingConfig.consideraSabados || false} onChange={(e) => setEditingConfig({ ...editingConfig, consideraSabados: e.target.checked })} />
                  Contar sábados
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingConfig.consideraDomingos || false} onChange={(e) => setEditingConfig({ ...editingConfig, consideraDomingos: e.target.checked })} />
                  Contar domingos
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingConfig.consideraFeriados || false} onChange={(e) => setEditingConfig({ ...editingConfig, consideraFeriados: e.target.checked })} />
                  Contar feriados
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={saveConfig} className="px-4 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: "#EA7704" }}>Guardar</button>
                <button onClick={() => setEditingConfig(null)} className="px-4 py-1.5 rounded-lg text-sm border">Cancelar</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Operador</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">TAT Máx Garantía</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">TAT Obj Woden</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">TAT Obj Lab</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Sáb</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Dom</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Feriados</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">{c.segmento}</td>
                    <td className="py-2 px-3 text-right">{c.tatMaximoGarantia}d</td>
                    <td className="py-2 px-3 text-right">{c.tatObjetivoWoden}d</td>
                    <td className="py-2 px-3 text-right">{c.tatObjetivoLab}d</td>
                    <td className="py-2 px-3 text-center">{c.consideraSabados ? "Si" : "No"}</td>
                    <td className="py-2 px-3 text-center">{c.consideraDomingos ? "Si" : "No"}</td>
                    <td className="py-2 px-3 text-center">{c.consideraFeriados ? "Si" : "No"}</td>
                    <td className="py-2 px-3 text-center">
                      <button onClick={() => setEditingConfig({ ...c })} className="text-blue-600 hover:text-blue-800 text-xs">Editar</button>
                    </td>
                  </tr>
                ))}
                {configs.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-gray-400">No hay configuraciones. Agregue una para cada operador.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feriados Tab */}
      {tab === "feriados" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Feriados Perú</h2>

          {/* Add Holiday */}
          <div className="flex gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <input type="date" value={newFeriado.fecha} onChange={(e) => setNewFeriado({ ...newFeriado, fecha: e.target.value })}
              className="border rounded-lg px-3 py-1.5 text-sm" />
            <input type="text" value={newFeriado.nombre} onChange={(e) => setNewFeriado({ ...newFeriado, nombre: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder="Nombre del feriado" />
            <button onClick={addFeriado} disabled={!newFeriado.fecha || !newFeriado.nombre}
              className="px-4 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ backgroundColor: "#EA7704" }}>
              Agregar
            </button>
          </div>

          <div className="overflow-y-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Feriado</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {feriados.map((f) => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 px-3 font-mono text-xs">{new Date(f.fecha).toLocaleDateString("es-PE")}</td>
                    <td className="py-1.5 px-3">{f.nombre}</td>
                    <td className="py-1.5 px-3 text-center">
                      <button onClick={() => deleteFeriado(f.id)} className="text-red-500 hover:text-red-700 text-xs">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
