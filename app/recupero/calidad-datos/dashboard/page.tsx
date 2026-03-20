'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, PieChart, Pie, Cell,
} from 'recharts'

interface TrendPoint {
  period: string
  source: string
  totalRows: number
  validPhoneRows: number
  incompletePhoneRows: number
  invalidPhoneRows: number
  missingPhoneRows: number
  validCoordsRows: number
  coordsInPeruRows: number
  coordsOutsidePeruRows: number
  validAddressRows: number
  extractedCoordsRows: number
  importCount: number
  pctValidPhone: number
  pctIncompletePhone: number
  pctInvalidPhone: number
  pctMissingPhone: number
  pctValidCoords: number
  pctCoordsInPeru: number
  pctCoordsOutsidePeru: number
  pctValidAddress: number
}

const COLORS = {
  claro: '#DC2626',
  directv: '#2563EB',
  validPhone: '#16A34A',
  incompletePhone: '#EAB308',
  invalidPhone: '#DC2626',
  missingPhone: '#9CA3AF',
  inPeru: '#15803D',
  outsidePeru: '#DC2626',
  validAddr: '#7C3AED',
  coords: '#2563EB',
  orange: '#EA7704',
}

const PIE_COLORS = ['#16A34A', '#EAB308', '#DC2626', '#9CA3AF']

function pct(n: number, total: number) {
  if (!total) return '0.0'
  return (n / total * 100).toFixed(1)
}

export default function InternalDashboardPage() {
  const { authenticated } = useAuth()
  const [granularity, setGranularity] = useState<'month' | 'day'>('month')
  const [filterSource, setFilterSource] = useState<string>('')
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('granularity', granularity)
    if (filterSource) params.set('source', filterSource)
    const res = await fetch(`/api/recupero/calidad-datos/trends?${params}`)
    const data = await res.json()
    setTrends(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [granularity, filterSource])

  useEffect(() => {
    if (authenticated) fetchTrends()
  }, [authenticated, fetchTrends])

  if (!authenticated) return <div className="p-8 text-center text-gray-500">Cargando...</div>

  // Merge Claro + DirecTV into same period for comparison charts
  const periods = Array.from(new Set(trends.map(t => t.period))).sort()
  const mergedByPeriod = periods.map(p => {
    const claro = trends.find(t => t.period === p && t.source === 'CLARO')
    const dtv = trends.find(t => t.period === p && t.source === 'DIRECTV')
    return {
      period: p,
      claroTotal: claro?.totalRows || 0,
      dtvTotal: dtv?.totalRows || 0,
      claroPhonePct: claro?.pctValidPhone || 0,
      dtvPhonePct: dtv?.pctValidPhone || 0,
      claroCoordsPct: claro?.pctCoordsInPeru || 0,
      dtvCoordsPct: dtv?.pctCoordsInPeru || 0,
      claroAddrPct: claro?.pctValidAddress || 0,
      dtvAddrPct: dtv?.pctValidAddress || 0,
      claroOutsidePeru: claro?.coordsOutsidePeruRows || 0,
      dtvOutsidePeru: dtv?.coordsOutsidePeruRows || 0,
    }
  })

  // Aggregated totals for pie charts
  const totals = trends.reduce((acc, t) => ({
    total: acc.total + t.totalRows,
    validPhone: acc.validPhone + t.validPhoneRows,
    incomplete: acc.incomplete + t.incompletePhoneRows,
    invalid: acc.invalid + t.invalidPhoneRows,
    missing: acc.missing + t.missingPhoneRows,
    inPeru: acc.inPeru + t.coordsInPeruRows,
    outsidePeru: acc.outsidePeru + t.coordsOutsidePeruRows,
    noCoords: acc.noCoords + (t.totalRows - t.validCoordsRows),
    validAddr: acc.validAddr + t.validAddressRows,
  }), { total: 0, validPhone: 0, incomplete: 0, invalid: 0, missing: 0, inPeru: 0, outsidePeru: 0, noCoords: 0, validAddr: 0 })

  const phonePieData = [
    { name: 'Valido', value: totals.validPhone },
    { name: 'Incompleto', value: totals.incomplete },
    { name: 'Invalido', value: totals.invalid },
    { name: 'Sin Tel', value: totals.missing },
  ].filter(d => d.value > 0)

  const coordsPieData = [
    { name: 'En Peru', value: totals.inPeru, color: COLORS.inPeru },
    { name: 'Fuera Peru', value: totals.outsidePeru, color: COLORS.outsidePeru },
    { name: 'Sin Coords', value: totals.noCoords, color: COLORS.missingPhone },
  ].filter(d => d.value > 0)

  // Single-source trend data (when filtering by source)
  const singleSourceData = filterSource
    ? trends.filter(t => t.source === filterSource)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard Interno - Calidad de Datos</h1>
          <p className="text-sm text-gray-500 mt-1">Tendencias y comparacion de calidad entre clientes</p>
        </div>
        <div className="flex gap-2">
          <Link href="/recupero/calidad-datos" className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50">
            ← Datos
          </Link>
          <Link href="/recupero/calidad-datos/reporte" className="px-3 py-1.5 rounded text-sm text-white font-medium" style={{ backgroundColor: '#EA7704' }}>
            Reporte Cliente
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Granularidad</label>
          <div className="flex rounded overflow-hidden border">
            <button onClick={() => setGranularity('month')}
              className={`px-3 py-1.5 text-sm ${granularity === 'month' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
              Mensual
            </button>
            <button onClick={() => setGranularity('day')}
              className={`px-3 py-1.5 text-sm ${granularity === 'day' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
              Diario
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">Ambos (comparacion)</option>
            <option value="CLARO">Claro</option>
            <option value="DIRECTV">DirecTV</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Cargando tendencias...</div>
      ) : trends.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No hay datos. Importe archivos primero.</div>
      ) : (
        <>
          {/* Row 1: Volume + Phone pie */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Volume over time */}
            <div className="md:col-span-2 bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Volumen de Registros</h3>
              <ResponsiveContainer width="100%" height={250}>
                {!filterSource ? (
                  <BarChart data={mergedByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="claroTotal" name="Claro" fill={COLORS.claro} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="dtvTotal" name="DirecTV" fill={COLORS.directv} radius={[2, 2, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={singleSourceData!}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="totalRows" name="Registros" fill={filterSource === 'CLARO' ? COLORS.claro : COLORS.directv} radius={[2, 2, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Phone quality pie */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Estado Telefonos (Acumulado)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={phonePieData} cx="50%" cy="50%" outerRadius={60} innerRadius={25} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={10}>
                    {phonePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 text-[10px] mt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600" />Valido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />Incompleto</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" />Invalido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />Sin Tel</span>
              </div>
            </div>
          </div>

          {/* Row 2: Quality % trends */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Phone quality trend */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">% Telefono Valido</h3>
              <ResponsiveContainer width="100%" height={220}>
                {!filterSource ? (
                  <ComposedChart data={mergedByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="claroPhonePct" name="Claro" stroke={COLORS.claro} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="dtvPhonePct" name="DirecTV" stroke={COLORS.directv} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={singleSourceData!}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="pctValidPhone" name="% Tel Valido" stroke={COLORS.validPhone} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="pctIncompletePhone" name="% Incompleto" stroke={COLORS.incompletePhone} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Coords in Peru trend */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">% Coordenadas en Peru</h3>
              <ResponsiveContainer width="100%" height={220}>
                {!filterSource ? (
                  <ComposedChart data={mergedByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="claroCoordsPct" name="Claro" stroke={COLORS.claro} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="dtvCoordsPct" name="DirecTV" stroke={COLORS.directv} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={singleSourceData!}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="pctCoordsInPeru" name="% En Peru" stroke={COLORS.inPeru} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="pctCoordsOutsidePeru" name="% Fuera Peru" stroke={COLORS.outsidePeru} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 3: Address + Outside Peru count */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">% Direccion Valida</h3>
              <ResponsiveContainer width="100%" height={220}>
                {!filterSource ? (
                  <ComposedChart data={mergedByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="claroAddrPct" name="Claro" stroke={COLORS.claro} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="dtvAddrPct" name="DirecTV" stroke={COLORS.directv} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={singleSourceData!}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="pctValidAddress" name="% Dir Valida" stroke={COLORS.validAddr} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Coords pie */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Coordenadas (Acumulado)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={coordsPieData} cx="50%" cy="50%" outerRadius={60} innerRadius={25} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={10}>
                    {coordsPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center text-xs text-gray-500 mt-1">
                {totals.inPeru.toLocaleString()} en Peru | {totals.outsidePeru.toLocaleString()} fuera | {totals.noCoords.toLocaleString()} sin coords
              </div>
            </div>
          </div>

          {/* Summary table */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Resumen por Periodo</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase">
                    <th className="p-2 text-left">Periodo</th>
                    <th className="p-2 text-left">Fuente</th>
                    <th className="p-2 text-right">Registros</th>
                    <th className="p-2 text-right">% Tel OK</th>
                    <th className="p-2 text-right">% Tel Inc.</th>
                    <th className="p-2 text-right">% Tel Inv.</th>
                    <th className="p-2 text-right">% Coords Peru</th>
                    <th className="p-2 text-right">Fuera Peru</th>
                    <th className="p-2 text-right">% Dir OK</th>
                    <th className="p-2 text-right">Archivos</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">{t.period}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          t.source === 'CLARO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{t.source}</span>
                      </td>
                      <td className="p-2 text-right font-medium">{t.totalRows.toLocaleString()}</td>
                      <td className="p-2 text-right text-green-700">{t.pctValidPhone}%</td>
                      <td className="p-2 text-right text-yellow-600">{t.pctIncompletePhone}%</td>
                      <td className="p-2 text-right text-red-600">{t.pctInvalidPhone}%</td>
                      <td className="p-2 text-right text-green-700">{t.pctCoordsInPeru}%</td>
                      <td className="p-2 text-right text-red-600">{t.coordsOutsidePeruRows}</td>
                      <td className="p-2 text-right text-purple-700">{t.pctValidAddress}%</td>
                      <td className="p-2 text-right text-gray-500">{t.importCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
