'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
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
  importCount: number
  pctValidPhone: number
  pctCoordsInPeru: number
  pctValidAddress: number
}

function pct(n: number, total: number) {
  if (!total) return '0.0'
  return (n / total * 100).toFixed(1)
}

export default function CustomerReportPage() {
  const { authenticated } = useAuth()
  const [source, setSource] = useState<'CLARO' | 'DIRECTV'>('CLARO')
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/recupero/calidad-datos/trends?granularity=month&source=${source}`)
    const data = await res.json()
    setTrends(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [source])

  useEffect(() => {
    if (authenticated) fetchTrends()
  }, [authenticated, fetchTrends])

  if (!authenticated) return <div className="p-8 text-center text-gray-500">Cargando...</div>

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
    imports: acc.imports + t.importCount,
  }), { total: 0, validPhone: 0, incomplete: 0, invalid: 0, missing: 0, inPeru: 0, outsidePeru: 0, noCoords: 0, validAddr: 0, imports: 0 })

  const phonePieData = [
    { name: 'Valido', value: totals.validPhone },
    { name: 'Incompleto', value: totals.incomplete },
    { name: 'Invalido', value: totals.invalid },
    { name: 'Sin Telefono', value: totals.missing },
  ].filter(d => d.value > 0)

  const coordsPieData = [
    { name: 'En Peru', value: totals.inPeru },
    { name: 'Fuera de Peru', value: totals.outsidePeru },
    { name: 'Sin Coordenadas', value: totals.noCoords },
  ].filter(d => d.value > 0)

  const PIE_PHONE = ['#16A34A', '#EAB308', '#DC2626', '#9CA3AF']
  const PIE_COORDS = ['#15803D', '#DC2626', '#9CA3AF']

  const latestPeriod = trends.length > 0 ? trends[trends.length - 1] : null
  const prevPeriod = trends.length > 1 ? trends[trends.length - 2] : null

  function delta(current: number, previous: number | undefined) {
    if (previous === undefined) return null
    const d = current - previous
    if (d === 0) return <span className="text-gray-400 text-xs">= sin cambio</span>
    return d > 0
      ? <span className="text-green-600 text-xs font-medium">▲ +{d.toFixed(1)}pp</span>
      : <span className="text-red-600 text-xs font-medium">▼ {d.toFixed(1)}pp</span>
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header - print-friendly */}
      <div className="print:hidden flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button onClick={() => setSource('CLARO')}
            className={`px-4 py-2 rounded text-sm font-medium ${source === 'CLARO' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Claro
          </button>
          <button onClick={() => setSource('DIRECTV')}
            className={`px-4 py-2 rounded text-sm font-medium ${source === 'DIRECTV' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            DirecTV
          </button>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ backgroundColor: '#EA7704' }}>
          Imprimir / PDF
        </button>
      </div>

      {/* Report content */}
      <div className="bg-white rounded-lg shadow print:shadow-none p-8 space-y-8">
        {/* Report Header */}
        <div className="border-b pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Reporte de Calidad de Datos
              </h1>
              <p className="text-lg mt-1" style={{ color: source === 'CLARO' ? '#DC2626' : '#2563EB' }}>
                {source === 'CLARO' ? 'Claro Peru' : 'DirecTV Peru'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Woden del Peru S.A.C.</div>
              <div className="text-sm text-gray-500">Generado: {new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div className="text-sm text-gray-500">{totals.imports} archivos procesados</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando datos...</div>
        ) : trends.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No hay datos disponibles para {source}</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Resumen Acumulado</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-gray-500">Total Registros</div>
                  <div className="text-2xl font-bold text-gray-800">{totals.total.toLocaleString()}</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-gray-500">% Telefono Valido</div>
                  <div className="text-2xl font-bold text-green-600">{pct(totals.validPhone, totals.total)}%</div>
                  {latestPeriod && prevPeriod && delta(latestPeriod.pctValidPhone, prevPeriod.pctValidPhone)}
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-gray-500">% Coords en Peru</div>
                  <div className="text-2xl font-bold text-green-700">{pct(totals.inPeru, totals.total)}%</div>
                  {latestPeriod && prevPeriod && delta(latestPeriod.pctCoordsInPeru, prevPeriod.pctCoordsInPeru)}
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-gray-500">Fuera de Peru</div>
                  <div className="text-2xl font-bold text-red-600">{totals.outsidePeru.toLocaleString()}</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-gray-500">% Direccion Valida</div>
                  <div className="text-2xl font-bold text-purple-600">{pct(totals.validAddr, totals.total)}%</div>
                  {latestPeriod && prevPeriod && delta(latestPeriod.pctValidAddress, prevPeriod.pctValidAddress)}
                </div>
              </div>
            </div>

            {/* Charts Row 1: Trends */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Tendencia Mensual - Calidad (%)</h2>
              <div className="border rounded-lg p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number, name: string) => name === 'Registros' ? v.toLocaleString() : `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="totalRows" name="Registros" fill="#E5E7EB" yAxisId="right" />
                    <Line type="monotone" dataKey="pctValidPhone" name="Tel Valido" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 4 }} yAxisId="left" />
                    <Line type="monotone" dataKey="pctCoordsInPeru" name="Coords Peru" stroke="#15803D" strokeWidth={2.5} dot={{ r: 4 }} yAxisId="left" />
                    <Line type="monotone" dataKey="pctValidAddress" name="Dir Valida" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 4 }} yAxisId="left" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts Row 2: Pies */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Calidad de Telefonos</h2>
                <div className="border rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={phonePieData} cx="50%" cy="50%" outerRadius={65} innerRadius={25} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={10}>
                        {phonePieData.map((_, i) => <Cell key={i} fill={PIE_PHONE[i % PIE_PHONE.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div className="flex justify-between"><span>Valido</span><span className="font-medium text-green-600">{totals.validPhone.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Incompleto</span><span className="font-medium text-yellow-600">{totals.incomplete.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Invalido</span><span className="font-medium text-red-600">{totals.invalid.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Sin Telefono</span><span className="font-medium text-gray-500">{totals.missing.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Calidad de Coordenadas</h2>
                <div className="border rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={coordsPieData} cx="50%" cy="50%" outerRadius={65} innerRadius={25} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={10}>
                        {coordsPieData.map((_, i) => <Cell key={i} fill={PIE_COORDS[i % PIE_COORDS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div className="flex justify-between"><span>En Peru</span><span className="font-medium text-green-700">{totals.inPeru.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Fuera de Peru</span><span className="font-medium text-red-600">{totals.outsidePeru.toLocaleString()}</span></div>
                    <div className="flex justify-between col-span-2"><span>Sin Coordenadas</span><span className="font-medium text-gray-500">{totals.noCoords.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly detail table */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Detalle Mensual</h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase">
                      <th className="p-2.5 text-left">Periodo</th>
                      <th className="p-2.5 text-right">Registros</th>
                      <th className="p-2.5 text-right">Tel OK</th>
                      <th className="p-2.5 text-right">Tel Inc.</th>
                      <th className="p-2.5 text-right">Tel Inv.</th>
                      <th className="p-2.5 text-right">Sin Tel</th>
                      <th className="p-2.5 text-right">En Peru</th>
                      <th className="p-2.5 text-right">Fuera</th>
                      <th className="p-2.5 text-right">Dir OK</th>
                      <th className="p-2.5 text-right">Archivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((t, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2.5 font-medium">{t.period}</td>
                        <td className="p-2.5 text-right">{t.totalRows.toLocaleString()}</td>
                        <td className="p-2.5 text-right text-green-700 font-medium">{t.pctValidPhone}%</td>
                        <td className="p-2.5 text-right text-yellow-600">{t.incompletePhoneRows}</td>
                        <td className="p-2.5 text-right text-red-600">{t.invalidPhoneRows}</td>
                        <td className="p-2.5 text-right text-gray-500">{t.missingPhoneRows}</td>
                        <td className="p-2.5 text-right text-green-700 font-medium">{t.pctCoordsInPeru}%</td>
                        <td className="p-2.5 text-right text-red-600">{t.coordsOutsidePeruRows}</td>
                        <td className="p-2.5 text-right text-purple-700">{t.pctValidAddress}%</td>
                        <td className="p-2.5 text-right text-gray-500">{t.importCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t pt-4 text-xs text-gray-400 text-center">
              <p>Reporte generado por Woden del Peru S.A.C. — Sistema de Gestion de Recupero</p>
              <p>Los datos reflejan la calidad de las bases de datos recibidas del cliente para operaciones de campo.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
