'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const RutaMap = dynamic(() => import('@/components/recupero/RutaMap'), { ssr: false })

interface Agente {
  id: string
  nombre: string
  latInicio: number
  lonInicio: number
  isActive: boolean
}

interface Parada {
  id: string
  secuencia: number
  periodo: string
  esAgendada: boolean
  sourceType: string
  sot: string | null
  codCliente: string | null
  cliente: string | null
  direccion: string | null
  distrito: string | null
  departamento: string | null
  latitud: number | null
  longitud: number | null
  telefono: string | null
  distanciaDesdeAnteriorKm: number
  tiempoViajeMin: number
  duracionVisitaMin: number
  horaEstimadaLlegada: string | null
  horaEstimadaSalida: string | null
}

interface Conflicto {
  cliente: string
  direccion: string
  periodo: string
  reason: string
}

interface Ruta {
  id: string
  agenteId: string
  fecha: string
  createdAt?: string
  totalVisitas: number
  totalDistanciaKm: number
  totalTiempoMin: number
  status: string
  agente: { nombre: string; latInicio: number; lonInicio: number }
  paradas?: Parada[]
  conflictos?: Conflicto[]
}

interface GenerationResult {
  rutas: Ruta[]
  totalVisitas: number
  totalDistanciaKm: number
  totalAgentes: number
  totalConflictos: number
  totalAgendadasInput: number
  totalAgendadasRuteadas: number
}

export default function ProgramacionRutasPage() {
  useAuth()
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([])
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // History
  const [history, setHistory] = useState<Ruta[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadAgentes = useCallback(async () => {
    const res = await fetch('/api/recupero/rutas/agentes?active=true')
    if (res.ok) {
      const data = await res.json()
      setAgentes(data)
      setSelectedAgentes(data.map((a: Agente) => a.id))
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/recupero/rutas/programacion')
      if (res.ok) {
        const data: Ruta[] = await res.json()
        setHistory(data)
        return data
      }
    } finally {
      setHistoryLoading(false)
    }
    return []
  }, [])

  const loadRoutesForDate = async (targetDate: string, historyData?: Ruta[]) => {
    const data = historyData || history
    const dateRoutes = data.filter((r) => r.fecha.slice(0, 10) === targetDate)
    if (dateRoutes.length === 0) return

    // Fetch full details with paradas for each route
    const fullRoutes = await Promise.all(
      dateRoutes.map(async (r) => {
        try {
          const detRes = await fetch(`/api/recupero/rutas/programacion/${r.id}`)
          return detRes.ok ? detRes.json() : r
        } catch {
          return r
        }
      })
    )

    setResult({
      rutas: fullRoutes,
      totalVisitas: fullRoutes.reduce((s: number, r: Ruta) => s + r.totalVisitas, 0),
      totalDistanciaKm: fullRoutes.reduce((s: number, r: Ruta) => s + r.totalDistanciaKm, 0),
      totalAgentes: fullRoutes.length,
      totalConflictos: fullRoutes.reduce((s: number, r: Ruta) => s + (r.conflictos?.length || 0), 0),
      totalAgendadasInput: 0,
      totalAgendadasRuteadas: 0,
    })
    setActiveTab(0)
  }

  useEffect(() => {
    loadAgentes()
    loadHistory().then((data) => {
      // Auto-load the most recent date's routes on page load
      if (data && data.length > 0) {
        const today = new Date().toISOString().slice(0, 10)
        const todayRoutes = data.filter((r: Ruta) => r.fecha.slice(0, 10) === today)
        if (todayRoutes.length > 0) {
          loadRoutesForDate(today, data)
        } else {
          const mostRecentDate = data[0].fecha.slice(0, 10)
          setFecha(mostRecentDate)
          loadRoutesForDate(mostRecentDate, data)
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generateRoutes = async () => {
    if (selectedAgentes.length === 0) {
      setError('Seleccione al menos un agente')
      return
    }
    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/recupero/rutas/programacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, agenteIds: selectedAgentes }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al generar rutas')
        return
      }

      // Load full route details with paradas for each generated route
      const fullRoutes = await Promise.all(
        data.rutas.map(async (r: Ruta) => {
          const detRes = await fetch(`/api/recupero/rutas/programacion/${r.id}`)
          return detRes.ok ? detRes.json() : r
        })
      )

      setResult({
        ...data,
        rutas: fullRoutes,
      })
      setActiveTab(0)
      loadHistory()
    } catch (err) {
      setError(`Error: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  const deleteRoute = async (id: string) => {
    if (!confirm('¿Eliminar esta ruta?')) return
    await fetch(`/api/recupero/rutas/programacion/${id}`, { method: 'DELETE' })
    loadHistory()
    if (result) {
      setResult({
        ...result,
        rutas: result.rutas.filter((r) => r.id !== id),
      })
    }
  }

  const exportRoute = async (rutaId: string, format: string) => {
    const res = await fetch(`/api/recupero/rutas/programacion/${rutaId}/export?format=${format}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'txt'
    a.download = `ruta_${fecha}_${activeTab}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportAll = async (format: string) => {
    const res = await fetch(`/api/recupero/rutas/programacion/export-all?fecha=${fecha}&format=${format}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rutas_${fecha}_todos.${format === 'xlsx' ? 'xlsx' : 'pdf'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleAgente = (id: string) => {
    setSelectedAgentes((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedAgentes.length === agentes.length) {
      setSelectedAgentes([])
    } else {
      setSelectedAgentes(agentes.map((a) => a.id))
    }
  }

  const currentRuta = result?.rutas[activeTab]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Programación de Rutas</h1>
        <div className="flex gap-2">
          <Link href="/recupero/rutas/configuracion" className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
            Configuración
          </Link>
          <Link href="/recupero/rutas/importar" className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
            Importar Agendas
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Fecha a Programar</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Agentes de Campo
              <button onClick={toggleAll} className="ml-2 text-xs text-[#EA7704]">
                {selectedAgentes.length === agentes.length ? 'Ninguno' : 'Todos'}
              </button>
            </label>
            <div className="flex flex-wrap gap-2">
              {agentes.length === 0 ? (
                <span className="text-sm text-gray-400">
                  No hay agentes configurados.{' '}
                  <Link href="/recupero/rutas/configuracion" className="text-[#EA7704] underline">
                    Configurar
                  </Link>
                </span>
              ) : (
                agentes.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer border transition-colors ${
                      selectedAgentes.includes(a.id)
                        ? 'bg-[#EA7704] text-white border-[#EA7704]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgentes.includes(a.id)}
                      onChange={() => toggleAgente(a.id)}
                      className="sr-only"
                    />
                    {a.nombre}
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            onClick={generateRoutes}
            disabled={generating || selectedAgentes.length === 0}
            className="px-6 py-2.5 bg-[#EA7704] text-white rounded-lg font-medium hover:bg-[#D06A03] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generating ? 'Generando...' : 'Generar Rutas'}
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
      </div>

      {/* Results */}
      {result && result.rutas.length > 0 && (
        <>
          {/* Agendadas Summary Card */}
          {result.totalAgendadasInput > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Agendadas del Día</h3>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-yellow-600">
                      {result.totalAgendadasRuteadas}
                    </span>
                    <span className="text-gray-400">/</span>
                    <span className="text-xl text-gray-500">{result.totalAgendadasInput}</span>
                    <span className="text-sm text-gray-400">programadas</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${Math.round((result.totalAgendadasRuteadas / result.totalAgendadasInput) * 100)}%`,
                        backgroundColor: result.totalAgendadasRuteadas === result.totalAgendadasInput ? '#22c55e' : '#eab308',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-green-600 font-medium">
                      {Math.round((result.totalAgendadasRuteadas / result.totalAgendadasInput) * 100)}% ruteadas
                    </span>
                    {result.totalConflictos > 0 && (
                      <span className="text-red-500">
                        {result.totalConflictos} no alcanzaron
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center shrink-0">
                  <div className="bg-yellow-50 rounded-lg px-4 py-2">
                    <div className="text-lg font-bold text-yellow-700">{result.totalAgendadasRuteadas}</div>
                    <div className="text-[10px] text-yellow-600">Ruteadas</div>
                  </div>
                  <div className="bg-red-50 rounded-lg px-4 py-2">
                    <div className="text-lg font-bold text-red-600">{result.totalConflictos}</div>
                    <div className="text-[10px] text-red-500">No Ruteadas</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{result.totalAgentes}</div>
              <div className="text-xs text-blue-600 mt-1">Agentes</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-700">{result.totalVisitas}</div>
              <div className="text-xs text-green-600 mt-1">Total Visitas</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-purple-700">
                {result.totalDistanciaKm.toFixed(1)}
              </div>
              <div className="text-xs text-purple-600 mt-1">Distancia Total (km)</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-orange-700">
                {Math.round(result.rutas.reduce((s, r) => s + r.totalTiempoMin, 0))}
              </div>
              <div className="text-xs text-orange-600 mt-1">Tiempo Total (min)</div>
            </div>
          </div>

          {/* Agent Tabs */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="flex border-b overflow-x-auto">
              {result.rutas.map((r, idx) => (
                <button
                  key={r.id}
                  onClick={() => setActiveTab(idx)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === idx
                      ? 'border-[#EA7704] text-[#EA7704]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r.agente.nombre}
                  <span className="ml-1.5 text-xs bg-gray-100 rounded-full px-1.5 py-0.5">
                    {r.totalVisitas}
                  </span>
                </button>
              ))}
            </div>

            {currentRuta && (
              <div className="p-5 space-y-5">
                {/* Agent stats */}
                <div className="flex flex-wrap gap-4 items-center text-sm">
                  <div className="bg-gray-50 rounded-lg px-4 py-2">
                    <span className="text-gray-500">Inicio:</span>{' '}
                    <span className="font-medium">
                      {currentRuta.agente.latInicio.toFixed(4)}, {currentRuta.agente.lonInicio.toFixed(4)}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2">
                    <span className="text-gray-500">Visitas:</span>{' '}
                    <span className="font-bold text-green-700">{currentRuta.totalVisitas}</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2">
                    <span className="text-gray-500">Distancia:</span>{' '}
                    <span className="font-bold text-purple-700">{currentRuta.totalDistanciaKm.toFixed(1)} km</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2">
                    <span className="text-gray-500">Tiempo:</span>{' '}
                    <span className="font-bold text-orange-700">{Math.round(currentRuta.totalTiempoMin)} min</span>
                  </div>
                </div>

                {/* Route table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-2 text-center font-medium text-gray-600">#</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600">Periodo</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Cliente</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Dirección</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Distrito</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-600">Dist.(km)</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-600">T.Viaje</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600">Llegada</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600">Salida</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentRuta.paradas || []).map((p) => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-2 text-center font-medium text-gray-800">{p.secuencia}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.periodo === 'AM'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {p.periodo}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-gray-800 max-w-[200px] truncate" title={p.cliente || ''}>
                            {p.cliente || p.codCliente || '—'}
                          </td>
                          <td className="px-2 py-2 text-gray-600 max-w-[200px] truncate" title={p.direccion || ''}>
                            {p.direccion || '—'}
                          </td>
                          <td className="px-2 py-2 text-gray-600">{p.distrito || '—'}</td>
                          <td className="px-2 py-2 text-right text-gray-600">
                            {p.distanciaDesdeAnteriorKm.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600">
                            {Math.round(p.tiempoViajeMin)} min
                          </td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{p.horaEstimadaLlegada || '—'}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{p.horaEstimadaSalida || '—'}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.esAgendada
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {p.esAgendada ? 'Agendada' : 'Insertada'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Map */}
                <div className="h-[400px] rounded-lg overflow-hidden border">
                  <RutaMap
                    puntoInicio={{
                      lat: currentRuta.agente.latInicio,
                      lon: currentRuta.agente.lonInicio,
                      nombre: currentRuta.agente.nombre,
                    }}
                    paradas={(currentRuta.paradas || [])
                      .filter((p) => p.latitud != null && p.longitud != null)
                      .map((p) => ({
                        secuencia: p.secuencia,
                        lat: p.latitud!,
                        lon: p.longitud!,
                        cliente: p.cliente || p.codCliente || '—',
                        direccion: p.direccion || '',
                        esAgendada: p.esAgendada,
                        periodo: p.periodo,
                        horaEstimadaLlegada: p.horaEstimadaLlegada || '',
                      }))}
                  />
                </div>

                {/* Conflicts */}
                {currentRuta.conflictos && currentRuta.conflictos.length > 0 && (
                  <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                    <h3 className="text-sm font-bold text-red-700 mb-3">
                      Conflictos de Programación ({currentRuta.conflictos.length})
                    </h3>
                    <p className="text-xs text-red-600 mb-3">
                      Las siguientes visitas agendadas se incluyeron pero exceden el horario del periodo. Requieren atención especial.
                    </p>
                    <div className="space-y-2">
                      {currentRuta.conflictos.map((c, idx) => (
                        <div key={idx} className="bg-white rounded-lg px-4 py-3 border border-red-100 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="font-medium text-red-800">{c.cliente}</span>
                              <span className="text-red-400 mx-2">|</span>
                              <span className="text-red-600">{c.direccion}</span>
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.periodo === 'AM' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {c.periodo}
                            </span>
                          </div>
                          <p className="text-xs text-red-500 mt-1">{c.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <span className="text-sm text-gray-500 self-center mr-2">Exportar:</span>
                  <button
                    onClick={() => exportRoute(currentRuta.id, 'pdf')}
                    className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    PDF Individual
                  </button>
                  <button
                    onClick={() => exportAll('pdf')}
                    className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    PDF Todos
                  </button>
                  <button
                    onClick={() => exportRoute(currentRuta.id, 'xlsx')}
                    className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    XLSX Individual
                  </button>
                  <button
                    onClick={() => exportAll('xlsx')}
                    className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    XLSX Todos
                  </button>
                  <button
                    onClick={() => exportRoute(currentRuta.id, 'csv')}
                    className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    TXT/CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {result && result.rutas.length === 0 && (
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 text-center">
          <p className="text-yellow-800 font-medium">No se generaron rutas</p>
          <p className="text-yellow-600 text-sm mt-1">
            Verifique que existan agendas importadas para la fecha seleccionada y que los agentes tengan coordenadas configuradas.
          </p>
        </div>
      )}

      {/* Route History */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Historial de Rutas Generadas</h2>
          <button
            onClick={() => { setHistoryLoading(true); loadHistory() }}
            className="px-3 py-1.5 text-xs font-medium border rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Refrescar
          </button>
        </div>

        {historyLoading ? (
          <p className="text-gray-400">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-gray-400 text-sm">No se han generado rutas aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Día Ruteado</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha Gen</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Agente</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Visitas</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Distancia</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Tiempo</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Estado</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-gray-50 cursor-pointer ${
                    result?.rutas.some((rr) => rr.id === r.id) ? 'bg-orange-50' : ''
                  }`} onClick={() => { setFecha(r.fecha.slice(0, 10)); loadRoutesForDate(r.fecha.slice(0, 10)) }}>
                    <td className="px-3 py-2 font-medium">
                      {new Date(r.fecha).toLocaleDateString('es-PE')}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(r.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-2">{r.agente?.nombre || '—'}</td>
                    <td className="px-3 py-2 text-right">{r.totalVisitas}</td>
                    <td className="px-3 py-2 text-right">{r.totalDistanciaKm.toFixed(1)} km</td>
                    <td className="px-3 py-2 text-right">{Math.round(r.totalTiempoMin)} min</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'GENERADA' ? 'bg-gray-100 text-gray-600' :
                        r.status === 'CONFIRMADA' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center space-x-2">
                      <button
                        onClick={() => {
                          setFecha(r.fecha.slice(0, 10))
                          loadRoutesForDate(r.fecha.slice(0, 10))
                        }}
                        className="text-[#EA7704] hover:text-[#D06A03] text-xs font-medium"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => deleteRoute(r.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
