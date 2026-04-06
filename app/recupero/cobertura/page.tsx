'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface AttemptBucket { visits: number; count: number }

interface ImportStat {
  importId: string; fileName: string; source: string; importDate: string
  totalTasks: number; exitosas: number; fallidas: number; quemadas: number
  equiposRecuperados: number; effectivenessPct: number; uniqueCustomers: number
  customersSingleVisit: number; customersMultiVisit: number
  dateFrom: string | null; dateTo: string | null
  attemptDistribution: AttemptBucket[]
}

interface CustomerRow {
  customerId: string; nombreUsuario: string; departamento: string
  agentes: string[]; visits: number; recoveredVisits: number
  failedVisits: number; burnedVisits: number; equiposRecuperados: number
  firstVisit: string | null; lastVisit: string | null; lastStatus: string
  appearsInImports: number
}

interface VisitDetail {
  id: string; externalId: string | null; fechaCierre: string | null
  tipoCierre: string | null; agenteCampo: string; nombreUsuario: string | null
  direccion: string | null; departamento: string | null; ciudad: string | null
  tipoBase: string | null; esQuemada: boolean; distanciaMetros: number | null
  equiposRecuperados: number; tarea: string | null
  import: { fileName: string; createdAt: string }
}

interface CoberturaData {
  summary: {
    totalImports: number; totalTasks: number; totalCustomers: number
    customersRecovered: number; customersNeverRecovered: number
    customersSingleVisit: number; customersMultiVisit: number
    recoveryPct: number; totalEquipos: number
  }
  attemptDistribution: AttemptBucket[]
  perImport: ImportStat[]
  allCustomers: CustomerRow[]
}

const COLORS = { green: '#16A34A', red: '#DC2626', yellow: '#EAB308', blue: '#2563EB', orange: '#EA7704', purple: '#7C3AED' }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CoberturaPage() {
  useAuth()
  const [data, setData] = useState<CoberturaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedImport, setExpandedImport] = useState<string | null>(null)

  // Drilldown state
  const [drilldownVisits, setDrilldownVisits] = useState<number | null>(null) // filter by visit count
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [visitDetails, setVisitDetails] = useState<VisitDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/recupero/cobertura')
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const loadCustomerDetails = async (customerId: string) => {
    if (selectedCustomer === customerId) {
      setSelectedCustomer(null)
      return
    }
    setSelectedCustomer(customerId)
    setVisitDetails([])
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/recupero/cobertura/drilldown?customerId=${encodeURIComponent(customerId)}`)
      if (res.ok) {
        const data = await res.json()
        setVisitDetails(data)
      }
    } finally {
      setLoadingDetails(false)
      setTimeout(() => {
        document.getElementById('visit-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>
  if (!data) return <div className="p-6 text-red-500">Error al cargar datos</div>

  const { summary, attemptDistribution, perImport, allCustomers } = data

  const histogramData = attemptDistribution.map((d) => ({
    label: d.visits === 1 ? '1 visita' : `${d.visits} visitas`,
    count: d.count,
    visits: d.visits,
  }))

  // Filtered customer list for drilldown
  const filteredCustomers = drilldownVisits !== null
    ? allCustomers.filter((c) => c.visits === drilldownVisits)
    : allCustomers.slice(0, 50)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cobertura — Servicios de Campo</h1>
          <p className="text-sm text-gray-500 mt-1">Análisis de visitas ejecutadas por base recibida y cliente</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Refrescar</button>
      </div>

      {/* ── Summary Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className="text-3xl font-bold text-gray-800">{summary.totalImports}</div>
          <div className="text-xs text-gray-500 mt-1">Bases Recibidas</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className="text-3xl font-bold text-blue-700">{summary.totalTasks.toLocaleString()}</div>
          <div className="text-xs text-blue-600 mt-1">Total Gestiones</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className="text-3xl font-bold text-orange-600">{summary.totalCustomers.toLocaleString()}</div>
          <div className="text-xs text-orange-500 mt-1">Clientes Únicos</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className="text-3xl font-bold text-green-700">{summary.customersRecovered.toLocaleString()}</div>
          <div className="text-xs text-green-600 mt-1">Recuperados</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className={`text-3xl font-bold ${summary.customersNeverRecovered > 0 ? 'text-red-600' : 'text-green-700'}`}>
            {summary.customersNeverRecovered.toLocaleString()}
          </div>
          <div className="text-xs text-red-500 mt-1">Sin Recuperar</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
          <div className={`text-3xl font-bold ${summary.recoveryPct >= 50 ? 'text-green-700' : 'text-red-600'}`}>
            {summary.recoveryPct}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Tasa Recuperación</div>
        </div>
      </div>

      {/* ── Multi-visit vs Single-visit ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">1 sola visita</span>
            <span className="text-2xl font-bold text-blue-700">{summary.customersSingleVisit.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${summary.totalCustomers > 0 ? (summary.customersSingleVisit / summary.totalCustomers * 100) : 0}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">Múltiples visitas</span>
            <span className="text-2xl font-bold text-orange-600">{summary.customersMultiVisit.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div className="h-2 rounded-full bg-orange-500" style={{ width: `${summary.totalCustomers > 0 ? (summary.customersMultiVisit / summary.totalCustomers * 100) : 0}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">Equipos Recuperados</span>
            <span className="text-2xl font-bold text-purple-700">{summary.totalEquipos.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div className="h-2 rounded-full bg-purple-500" style={{ width: `${summary.totalTasks > 0 ? Math.min((summary.totalEquipos / summary.totalTasks * 100), 100) : 0}%` }} />
          </div>
          <div className="text-xs text-gray-400 mt-1">{summary.totalTasks > 0 ? (summary.totalEquipos / summary.totalTasks).toFixed(2) : 0} equipos/gestión</div>
        </div>
      </div>

      {/* ── Visit Distribution Histogram (clickable) ──── */}
      {histogramData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Distribución: Visitas por Cliente</h3>
          <p className="text-xs text-gray-400 mb-4">Haga clic en una barra para ver los clientes con esa cantidad de visitas</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} onClick={(e) => {
                if (e?.activePayload?.[0]) {
                  const v = e.activePayload[0].payload.visits
                  setDrilldownVisits(drilldownVisits === v ? null : v)
                  setSelectedCustomer(null)
                }
              }} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [value.toLocaleString() + ' clientes', '']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogramData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={drilldownVisits === entry.visits ? COLORS.orange : entry.visits === 1 ? COLORS.blue : entry.visits <= 3 ? COLORS.yellow : COLORS.red}
                      stroke={drilldownVisits === entry.visits ? '#000' : 'none'}
                      strokeWidth={drilldownVisits === entry.visits ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Azul: 1 visita | Amarillo: 2-3 visitas | Rojo: 4+ visitas
          </p>
        </div>
      )}

      {/* ── Drilldown: Customer List ─────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {drilldownVisits !== null
              ? `Clientes con ${drilldownVisits} visita${drilldownVisits > 1 ? 's' : ''} (${filteredCustomers.length})`
              : `Clientes con Más Visitas (top 50)`
            }
          </h3>
          {drilldownVisits !== null && (
            <button
              onClick={() => { setDrilldownVisits(null); setSelectedCustomer(null) }}
              className="px-3 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Mostrar todos
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-600">Cédula</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Departamento</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Agente(s)</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Visitas</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Exitosas</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Fallidas</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Quemadas</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Equipos</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Primera</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Última</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Último Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <React.Fragment key={c.customerId}>
                  <tr
                    className={`border-b hover:bg-gray-50 cursor-pointer ${selectedCustomer === c.customerId ? 'bg-orange-50' : ''}`}
                    onClick={() => loadCustomerDetails(c.customerId)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-blue-700">
                      <span className="mr-1 text-gray-400">{selectedCustomer === c.customerId ? '▼' : '▶'}</span>
                      {c.customerId}
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate" title={c.nombreUsuario}>{c.nombreUsuario || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{c.departamento || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-[150px] truncate" title={c.agentes.join(', ')}>
                      {c.agentes.length > 0 ? c.agentes.join(', ') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-orange-600">{c.visits}</td>
                    <td className="px-3 py-2 text-right text-green-700">{c.recoveredVisits}</td>
                    <td className="px-3 py-2 text-right text-red-600">{c.failedVisits}</td>
                    <td className="px-3 py-2 text-right text-orange-500">{c.burnedVisits}</td>
                    <td className="px-3 py-2 text-right text-purple-700">{c.equiposRecuperados}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(c.firstVisit)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(c.lastVisit)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        c.lastStatus === 'RECUPERADO WODEN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {c.lastStatus || '—'}
                      </span>
                    </td>
                  </tr>
                  {selectedCustomer === c.customerId && (
                    <tr>
                      <td colSpan={12} className="p-0">
                        <div id="visit-detail-panel" className="px-4 py-3 bg-gray-50 border-b-2 border-orange-200">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-gray-600">
                              Historial de Visitas — {c.nombreUsuario || c.customerId}
                              <span className="text-gray-400 font-normal ml-2">({visitDetails.length} registros)</span>
                            </h4>
                          </div>
                          {loadingDetails ? (
                            <p className="text-gray-400 text-xs py-2">Cargando...</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-white">
                                  <th className="px-2 py-1 text-center font-medium text-gray-500">#</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Fecha</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Agente</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Resultado</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Dirección</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Departamento</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Tipo Base</th>
                                  <th className="px-2 py-1 text-right font-medium text-gray-500">Dist.(m)</th>
                                  <th className="px-2 py-1 text-center font-medium text-gray-500">Quemada</th>
                                  <th className="px-2 py-1 text-right font-medium text-gray-500">Equipos</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">Archivo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visitDetails.map((v, idx) => (
                                  <tr key={v.id} className={v.tipoCierre === 'RECUPERADO WODEN' ? 'bg-green-50' : v.esQuemada ? 'bg-red-50' : 'hover:bg-white'}>
                                    <td className="px-2 py-1 text-center text-gray-400">{idx + 1}</td>
                                    <td className="px-2 py-1 font-medium">{fmtDate(v.fechaCierre)}</td>
                                    <td className="px-2 py-1">{v.agenteCampo}</td>
                                    <td className="px-2 py-1">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        v.tipoCierre === 'RECUPERADO WODEN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                      }`}>
                                        {v.tipoCierre || '—'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 max-w-[180px] truncate text-gray-600" title={v.direccion || ''}>{v.direccion || '—'}</td>
                                    <td className="px-2 py-1 text-gray-600">{v.departamento || '—'}</td>
                                    <td className="px-2 py-1 text-gray-500">{v.tipoBase || '—'}</td>
                                    <td className="px-2 py-1 text-right">{v.distanciaMetros != null ? Math.round(v.distanciaMetros) : '—'}</td>
                                    <td className="px-2 py-1 text-center">
                                      {v.esQuemada ? <span className="text-red-600 font-bold">SI</span> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-2 py-1 text-right text-purple-700">{v.equiposRecuperados || '—'}</td>
                                    <td className="px-2 py-1 text-gray-400 max-w-[120px] truncate" title={v.import.fileName}>{v.import.fileName}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Per-Import Table ──────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Detalle por Base Recibida</h3>
        {perImport.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay bases importadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Archivo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha Import</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Periodo</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Gestiones</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Exitosas</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Fallidas</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Quemadas</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Efectividad</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Clientes</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Equipos</th>
                </tr>
              </thead>
              <tbody>
                {perImport.map((imp) => (
                  <tr
                    key={imp.importId}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${expandedImport === imp.importId ? 'bg-orange-50' : ''}`}
                    onClick={() => setExpandedImport(expandedImport === imp.importId ? null : imp.importId)}
                  >
                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={imp.fileName}>{imp.fileName}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{fmtDate(imp.importDate)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {fmtDate(imp.dateFrom)}{imp.dateTo && imp.dateTo !== imp.dateFrom ? ` — ${fmtDate(imp.dateTo)}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{imp.totalTasks.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-green-700">{imp.exitosas.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">{imp.fallidas.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-orange-600">{imp.quemadas.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-14 bg-gray-200 rounded-full h-2">
                          <div className={`h-2 rounded-full ${imp.effectivenessPct >= 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${imp.effectivenessPct}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${imp.effectivenessPct >= 50 ? 'text-green-700' : 'text-red-600'}`}>{imp.effectivenessPct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-medium">{imp.uniqueCustomers.toLocaleString()}</span>
                      {imp.customersMultiVisit > 0 && (
                        <span className="text-[10px] text-orange-500 ml-1">({imp.customersMultiVisit} revis.)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-purple-700">{imp.equiposRecuperados.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-medium">
                  <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                  <td className="px-3 py-2 text-right">{perImport.reduce((s, i) => s + i.totalTasks, 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-green-700">{perImport.reduce((s, i) => s + i.exitosas, 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-600">{perImport.reduce((s, i) => s + i.fallidas, 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-orange-600">{perImport.reduce((s, i) => s + i.quemadas, 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-medium ${summary.recoveryPct >= 50 ? 'text-green-700' : 'text-red-600'}`}>
                      {summary.totalTasks > 0 ? (perImport.reduce((s, i) => s + i.exitosas, 0) / summary.totalTasks * 100).toFixed(1) : 0}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{summary.totalCustomers.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-purple-700">{summary.totalEquipos.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>

            {expandedImport && (() => {
              const imp = perImport.find((i) => i.importId === expandedImport)
              if (!imp || imp.attemptDistribution.length === 0) return null
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Visitas por Cliente — {imp.fileName}</h4>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={imp.attemptDistribution.map((d) => ({ label: `${d.visits} vis.`, count: d.count, visits: d.visits }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => [value.toLocaleString() + ' clientes', '']} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {imp.attemptDistribution.map((entry, idx) => (
                            <Cell key={idx} fill={entry.visits === 1 ? COLORS.blue : entry.visits <= 3 ? COLORS.yellow : COLORS.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
