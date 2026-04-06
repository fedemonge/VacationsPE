"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Transaction {
  id: string;
  fecha: string;
  source: string;
  etapa: string;
  tipoTransaccion: string;
  falla: string;
  fallaDescripcion: string;
  resultadoDiagnostico: string;
  orgOrigen: string;
  orgDestino: string;
  subinvOrigen: string;
  subinvDestino: string;
  estado: string;
  familiaEquipo: string;
  usuario: string;
  ciclo: number;
  esIngreso: boolean;
  fuentePreferida: boolean;
}

interface SerialSummary {
  numeroSerie: string;
  totalTransacciones: number;
  totalCycles: number;
  familia: string;
  cliente: string;
  primerIngreso: string;
  ultimoIngreso: string;
  totalOSCM: number;
  totalWMS: number;
  diagnosticos: { sinFalla: number; conFalla: number; sinDiagnostico: number };
  transactions: Transaction[];
}

const ETAPA_COLORS: Record<string, string> = {
  INGRESO: "bg-blue-100 text-blue-800",
  DIAGNOSTICO: "bg-yellow-100 text-yellow-800",
  REPARACION: "bg-red-100 text-red-800",
  SALIDA: "bg-green-100 text-green-800",
};

export default function SerieDetailPage() {
  const { authenticated } = useAuth();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("s") || "");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SerialSummary | null>(null);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | "OSCM" | "WMS">("");

  const doSearch = useCallback(async (serial?: string) => {
    const s = (serial || search).trim();
    if (!s) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/remanufactura/serie?numeroSerie=${encodeURIComponent(s)}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Error al buscar");
        return;
      }
      const result = await res.json();
      if (result.totalTransacciones === 0) {
        setError(`No se encontraron transacciones para "${s}"`);
        return;
      }
      setData(result);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Auto-search from URL param
  useEffect(() => {
    const s = searchParams.get("s");
    if (s && authenticated) {
      setSearch(s);
      doSearch(s);
    }
  }, [authenticated, searchParams]);

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Inicia sesión para acceder.</div>;
  }

  const filteredTxns = data?.transactions.filter((t) => !sourceFilter || t.source === sourceFilter) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial por Número de Serie</h1>
          <p className="text-sm text-gray-500 mt-1">Todas las transacciones de un equipo individual</p>
        </div>
        <Link href="/remanufactura" className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50">
          ← Dashboard
        </Link>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Número de Serie</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Ej: H25GBP012HA0B3"
              className="input-field text-sm font-mono"
            />
          </div>
          <button onClick={() => doSearch()} disabled={loading || !search.trim()} className="btn-primary text-sm px-6 py-2">
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-center text-red-500 text-sm">{error}</div>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Serie</p>
              <p className="text-sm font-bold font-mono mt-1">{data.numeroSerie}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Familia</p>
              <p className="text-lg font-bold mt-1">{data.familia}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Refabricaciones</p>
              <p className="text-lg font-bold text-orange-600 mt-1">{data.totalCycles}</p>
              <p className="text-xs text-gray-400 mt-1">Ingresos al laboratorio</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Transacciones</p>
              <p className="text-lg font-bold mt-1">{data.totalTransacciones}</p>
              <p className="text-xs text-gray-400 mt-1">OSCM: {data.totalOSCM} | WMS: {data.totalWMS}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Sin Falla</p>
              <p className="text-lg font-bold text-green-600 mt-1">{data.diagnosticos.sinFalla}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Con Falla</p>
              <p className="text-lg font-bold text-red-600 mt-1">{data.diagnosticos.conFalla}</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500 font-medium">Período</p>
              <p className="text-xs font-medium mt-1">{data.primerIngreso}</p>
              <p className="text-xs text-gray-400">→ {data.ultimoIngreso}</p>
            </div>
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Fuente:</span>
            {([["", "Todas"], ["OSCM", "OSCM"], ["WMS", "WMS"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSourceFilter(val)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  sourceFilter === val
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-600 border-gray-300 hover:border-orange-300"
                }`}
              >
                {label} ({val === "" ? data.totalTransacciones : val === "OSCM" ? data.totalOSCM : data.totalWMS})
              </button>
            ))}
          </div>

          {/* Transactions Table */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Transacciones ({filteredTxns.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">#</th>
                    <th className="text-center py-2 px-2 font-semibold text-orange-600">Ciclo</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Fecha</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Fuente</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Etapa</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Tipo Transacción</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Diagnóstico</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Falla</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Estado</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Org. Origen</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Org. Destino</th>
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map((t, idx) => (
                    <tr key={t.id} className={`border-b hover:bg-gray-50 ${t.esIngreso ? "bg-orange-50 border-orange-200" : "border-gray-100"}`}>
                      <td className="py-1.5 px-2 text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 px-2 text-center">
                        {t.esIngreso ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold">{t.ciclo}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">{t.ciclo || ""}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap font-medium">{t.fecha}</td>
                      <td className="py-1.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.source === "WMS" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                          {t.source}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        {t.etapa ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ETAPA_COLORS[t.etapa] || "bg-gray-100 text-gray-700"}`}>
                            {t.etapa}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-1.5 px-2 max-w-[200px] truncate" title={t.tipoTransaccion}>{t.tipoTransaccion || "—"}</td>
                      <td className="py-1.5 px-2">
                        {t.resultadoDiagnostico === "SIN_FALLA" ? (
                          <span className="text-green-600 font-medium">Sin Falla</span>
                        ) : t.resultadoDiagnostico === "CON_FALLA" ? (
                          <span className="text-red-600 font-medium">Con Falla</span>
                        ) : "—"}
                      </td>
                      <td className="py-1.5 px-2">{t.fallaDescripcion || "—"}</td>
                      <td className="py-1.5 px-2 max-w-[150px] truncate" title={t.estado}>{t.estado || "—"}</td>
                      <td className="py-1.5 px-2 max-w-[180px] truncate" title={t.orgOrigen}>{t.orgOrigen || "—"}</td>
                      <td className="py-1.5 px-2 max-w-[180px] truncate" title={t.orgDestino}>{t.orgDestino || "—"}</td>
                      <td className="py-1.5 px-2">{t.usuario || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
