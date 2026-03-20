'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import * as XLSX from 'xlsx'

interface ImportRecord {
  id: string
  source: string
  fileName: string
  receptionDate: string
  uploadDate: string
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
  importedByEmail: string
}

interface DetailRecord {
  id: string
  rowNumber: number
  externalId: string | null
  customerId: string | null
  customerName: string | null
  address: string | null
  district: string | null
  province: string | null
  department: string | null
  phone1: string | null
  phone2: string | null
  latitude: number | null
  longitude: number | null
  coordsSource: string
  equipmentType: string | null
  technology: string | null
  hasValidPhone: boolean
  phoneStatus: string
  hasValidCoords: boolean
  coordsInPeru: boolean
  coordsOutsidePeru: boolean
  hasValidAddress: boolean
  coordsExtracted: boolean
  status: string | null
}

function pct(n: number, total: number) {
  if (!total) return '0%'
  return (n / total * 100).toFixed(1) + '%'
}

export default function CalidadDatosPage() {
  const { authenticated } = useAuth()
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()))
  const [filterMonth, setFilterMonth] = useState<string>(String(new Date().getMonth() + 1))
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailRecords, setDetailRecords] = useState<Record<string, DetailRecord[]>>({})

  const fetchImports = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterSource) params.set('source', filterSource)
    if (filterYear) params.set('year', filterYear)
    if (filterMonth) params.set('month', filterMonth)
    const res = await fetch(`/api/recupero/calidad-datos?${params}`)
    const data = await res.json()
    setImports(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterSource, filterYear, filterMonth])

  useEffect(() => {
    if (authenticated) fetchImports()
  }, [authenticated, fetchImports])

  async function handleDelete(id: string) {
    if (!confirm('Seguro que desea eliminar esta importacion?')) return
    setDeleting(id)
    await fetch(`/api/recupero/calidad-datos/${id}`, { method: 'DELETE' })
    setImports(prev => prev.filter(i => i.id !== id))
    setDeleting(null)
  }

  async function toggleDetail(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    if (!detailRecords[id]) {
      const res = await fetch(`/api/recupero/calidad-datos/${id}`)
      const data = await res.json()
      setDetailRecords(prev => ({ ...prev, [id]: data.records || [] }))
    }
    setExpandedId(id)
  }

  function exportToExcel(importId: string, fileName: string) {
    const records = detailRecords[importId]
    if (!records?.length) return

    const rows = records.map(r => ({
      '#': r.rowNumber,
      'ID Externo': r.externalId || '',
      'ID Cliente': r.customerId || '',
      'Nombre': r.customerName || '',
      'Direccion': r.address || '',
      'Distrito': r.district || '',
      'Provincia': r.province || '',
      'Departamento': r.department || '',
      'Estado': r.status || '',
      'Telefono 1': r.phone1 || '',
      'Telefono 2': r.phone2 || '',
      'Latitud': r.latitude ?? '',
      'Longitud': r.longitude ?? '',
      'Origen Coords': r.coordsSource,
      'Equipo': r.equipmentType || '',
      'Tecnologia': r.technology || '',
      'Estado Tel': r.phoneStatus || (r.hasValidPhone ? 'VALID' : 'MISSING'),
      'Coords Validas': r.hasValidCoords ? 'SI' : 'NO',
      'En Peru': r.coordsInPeru ? 'SI' : r.coordsOutsidePeru ? 'NO' : 'N/A',
      'Fuera de Peru': r.coordsOutsidePeru ? 'SI' : 'NO',
      'Dir Valida': r.hasValidAddress ? 'SI' : 'NO',
      'Coords Extraidas': r.coordsExtracted ? 'SI' : 'NO',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    // Auto-width columns
    const colWidths = Object.keys(rows[0]).map(key => ({
      wch: Math.max(key.length, ...rows.slice(0, 50).map(r => String((r as Record<string, unknown>)[key] || '').length))
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Calidad de Datos')
    XLSX.writeFile(wb, `calidad_datos_${fileName.replace(/\.[^.]+$/, '')}.xlsx`)
  }

  // Aggregated stats
  const totalRows = imports.reduce((s, i) => s + i.totalRows, 0)
  const totalValidPhone = imports.reduce((s, i) => s + i.validPhoneRows, 0)
  const totalIncompletePhone = imports.reduce((s, i) => s + (i.incompletePhoneRows || 0), 0)
  const totalInvalidPhone = imports.reduce((s, i) => s + (i.invalidPhoneRows || 0), 0)
  const totalMissingPhone = imports.reduce((s, i) => s + (i.missingPhoneRows || 0), 0)
  const totalValidCoords = imports.reduce((s, i) => s + i.validCoordsRows, 0)
  const totalInPeru = imports.reduce((s, i) => s + (i.coordsInPeruRows || 0), 0)
  const totalOutsidePeru = imports.reduce((s, i) => s + (i.coordsOutsidePeruRows || 0), 0)
  const totalValidAddr = imports.reduce((s, i) => s + i.validAddressRows, 0)
  const totalExtracted = imports.reduce((s, i) => s + i.extractedCoordsRows, 0)

  // By source
  const claroImports = imports.filter(i => i.source === 'CLARO')
  const dtvImports = imports.filter(i => i.source === 'DIRECTV')
  const claroRows = claroImports.reduce((s, i) => s + i.totalRows, 0)
  const dtvRows = dtvImports.reduce((s, i) => s + i.totalRows, 0)

  if (!authenticated) return <div className="p-8 text-center text-gray-500">Cargando...</div>

  const months = [
    { v: '', l: 'Todos' }, { v: '1', l: 'Ene' }, { v: '2', l: 'Feb' }, { v: '3', l: 'Mar' },
    { v: '4', l: 'Abr' }, { v: '5', l: 'May' }, { v: '6', l: 'Jun' },
    { v: '7', l: 'Jul' }, { v: '8', l: 'Ago' }, { v: '9', l: 'Sep' },
    { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dic' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Calidad de Datos - Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Analisis de calidad de bases de datos de Claro y DirecTV</p>
        </div>
        <Link
          href="/recupero/calidad-datos/importar"
          className="px-4 py-2 rounded-lg text-white font-medium"
          style={{ backgroundColor: '#EA7704' }}
        >
          + Importar Archivo
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="CLARO">Claro</option>
            <option value="DIRECTV">DirecTV</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            {months.map(m => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Total Registros</div>
          <div className="text-xl font-bold text-gray-800">{totalRows.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Claro: {claroRows.toLocaleString()} | DTV: {dtvRows.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Tel. Valido</div>
          <div className="text-xl font-bold text-green-600">{pct(totalValidPhone, totalRows)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            <span className="text-yellow-600">{totalIncompletePhone} inc.</span>{' '}
            <span className="text-red-500">{totalInvalidPhone} inv.</span>{' '}
            <span className="text-gray-400">{totalMissingPhone} sin</span>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Con Coordenadas</div>
          <div className="text-xl font-bold text-blue-600">{pct(totalValidCoords, totalRows)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{totalValidCoords.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Dentro de Peru</div>
          <div className="text-xl font-bold text-green-700">{pct(totalInPeru, totalRows)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{totalInPeru.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Fuera de Peru</div>
          <div className="text-xl font-bold text-red-600">{totalOutsidePeru.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{pct(totalOutsidePeru, totalValidCoords)} de coords</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Dir. Valida</div>
          <div className="text-xl font-bold text-purple-600">{pct(totalValidAddr, totalRows)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{totalValidAddr.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <div className="text-[10px] text-gray-500 uppercase">Coords Extraidas</div>
          <div className="text-xl font-bold text-orange-600">{totalExtracted.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">De texto</div>
        </div>
      </div>

      {/* By Source Comparison */}
      {claroRows > 0 && dtvRows > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Comparacion por Cliente</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Metrica</th>
                <th className="text-center p-2">Claro</th>
                <th className="text-center p-2">DirecTV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">Total Registros</td>
                <td className="text-center p-2">{claroRows.toLocaleString()}</td>
                <td className="text-center p-2">{dtvRows.toLocaleString()}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">% Telefono Valido</td>
                <td className="text-center p-2">{pct(claroImports.reduce((s,i) => s+i.validPhoneRows, 0), claroRows)}</td>
                <td className="text-center p-2">{pct(dtvImports.reduce((s,i) => s+i.validPhoneRows, 0), dtvRows)}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">% Con Coordenadas</td>
                <td className="text-center p-2">{pct(claroImports.reduce((s,i) => s+i.validCoordsRows, 0), claroRows)}</td>
                <td className="text-center p-2">{pct(dtvImports.reduce((s,i) => s+i.validCoordsRows, 0), dtvRows)}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">% Dentro de Peru</td>
                <td className="text-center p-2 text-green-700 font-medium">{pct(claroImports.reduce((s,i) => s+(i.coordsInPeruRows||0), 0), claroRows)}</td>
                <td className="text-center p-2 text-green-700 font-medium">{pct(dtvImports.reduce((s,i) => s+(i.coordsInPeruRows||0), 0), dtvRows)}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Fuera de Peru</td>
                <td className="text-center p-2 text-red-600">{claroImports.reduce((s,i) => s+(i.coordsOutsidePeruRows||0), 0)}</td>
                <td className="text-center p-2 text-red-600">{dtvImports.reduce((s,i) => s+(i.coordsOutsidePeruRows||0), 0)}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">% Direccion Valida</td>
                <td className="text-center p-2">{pct(claroImports.reduce((s,i) => s+i.validAddressRows, 0), claroRows)}</td>
                <td className="text-center p-2">{pct(dtvImports.reduce((s,i) => s+i.validAddressRows, 0), dtvRows)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Import History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-sm font-bold text-gray-700">Historial de Importaciones</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : imports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No hay importaciones para el periodo seleccionado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                  <th className="p-3 text-left">Fuente</th>
                  <th className="p-3 text-left">Archivo</th>
                  <th className="p-3 text-left">Fecha Recep.</th>
                  <th className="p-3 text-right">Registros</th>
                  <th className="p-3 text-right">% Tel.</th>
                  <th className="p-3 text-right">% Coords</th>
                  <th className="p-3 text-right">En Peru</th>
                  <th className="p-3 text-right">Fuera Peru</th>
                  <th className="p-3 text-right">% Dir.</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => (
                  <>
                    <tr key={imp.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          imp.source === 'CLARO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {imp.source}
                        </span>
                      </td>
                      <td className="p-3 text-gray-700">{imp.fileName}</td>
                      <td className="p-3 text-gray-500">{new Date(imp.receptionDate).toLocaleDateString('es-PE')}</td>
                      <td className="p-3 text-right font-medium">{imp.totalRows}</td>
                      <td className="p-3 text-right">{pct(imp.validPhoneRows, imp.totalRows)}</td>
                      <td className="p-3 text-right">{pct(imp.validCoordsRows, imp.totalRows)}</td>
                      <td className="p-3 text-right text-green-700 font-medium">{imp.coordsInPeruRows || 0}</td>
                      <td className="p-3 text-right text-red-600">{imp.coordsOutsidePeruRows || 0}</td>
                      <td className="p-3 text-right">{pct(imp.validAddressRows, imp.totalRows)}</td>
                      <td className="p-3 text-center space-x-1">
                        <button
                          onClick={() => toggleDetail(imp.id)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          {expandedId === imp.id ? 'Cerrar' : 'Ver'}
                        </button>
                        {detailRecords[imp.id] && (
                          <button
                            onClick={() => exportToExcel(imp.id, imp.fileName)}
                            className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Excel
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(imp.id)}
                          disabled={deleting === imp.id}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deleting === imp.id ? '...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === imp.id && detailRecords[imp.id] && (
                      <tr key={`${imp.id}-detail`}>
                        <td colSpan={10} className="p-0">
                          <div className="bg-gray-50 p-4">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-gray-500">
                                {detailRecords[imp.id].length} registros totales (mostrando primeros 100)
                              </span>
                              <button
                                onClick={() => exportToExcel(imp.id, imp.fileName)}
                                className="text-xs px-3 py-1.5 rounded font-medium text-white"
                                style={{ backgroundColor: '#EA7704' }}
                              >
                                Descargar Excel Completo ({detailRecords[imp.id].length} registros)
                              </button>
                            </div>
                            <div className="max-h-96 overflow-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-200 sticky top-0">
                                    <th className="p-1.5 text-left">#</th>
                                    <th className="p-1.5 text-left">ID</th>
                                    <th className="p-1.5 text-left">Cliente</th>
                                    <th className="p-1.5 text-left">Nombre</th>
                                    <th className="p-1.5 text-left">Direccion</th>
                                    <th className="p-1.5 text-left">Distrito</th>
                                    <th className="p-1.5 text-left">Tel 1</th>
                                    <th className="p-1.5 text-center">Lat</th>
                                    <th className="p-1.5 text-center">Lon</th>
                                    <th className="p-1.5 text-center">Origen</th>
                                    <th className="p-1.5 text-center">Estado Tel</th>
                                    <th className="p-1.5 text-center">Coords</th>
                                    <th className="p-1.5 text-center">Peru</th>
                                    <th className="p-1.5 text-center">Dir OK</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailRecords[imp.id].slice(0, 100).map((rec) => (
                                    <tr key={rec.id} className="border-t">
                                      <td className="p-1.5">{rec.rowNumber}</td>
                                      <td className="p-1.5 font-mono text-gray-500">{rec.externalId?.slice(0, 10)}</td>
                                      <td className="p-1.5">{rec.customerId?.slice(0, 10)}</td>
                                      <td className="p-1.5 max-w-[120px] truncate">{rec.customerName}</td>
                                      <td className="p-1.5 max-w-[150px] truncate">{rec.address}</td>
                                      <td className="p-1.5">{rec.district}</td>
                                      <td className="p-1.5 font-mono">{rec.phone1}</td>
                                      <td className="p-1.5 text-center">{rec.latitude?.toFixed(4) ?? '-'}</td>
                                      <td className="p-1.5 text-center">{rec.longitude?.toFixed(4) ?? '-'}</td>
                                      <td className="p-1.5 text-center">
                                        <span className={`text-[10px] px-1 rounded ${
                                          rec.coordsSource === 'DIRECT' ? 'bg-green-100 text-green-700' :
                                          rec.coordsSource === 'EXTRACTED_ADDRESS' ? 'bg-yellow-100 text-yellow-700' :
                                          rec.coordsSource === 'EXTRACTED_OTHER' ? 'bg-orange-100 text-orange-700' :
                                          'bg-red-100 text-red-700'
                                        }`}>
                                          {rec.coordsSource}
                                        </span>
                                      </td>
                                      <td className="p-1.5 text-center">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                          rec.phoneStatus === 'VALID' ? 'bg-green-100 text-green-700' :
                                          rec.phoneStatus === 'INCOMPLETE' ? 'bg-yellow-100 text-yellow-700' :
                                          rec.phoneStatus === 'INVALID' ? 'bg-red-100 text-red-700' :
                                          'bg-gray-100 text-gray-500'
                                        }`}>
                                          {rec.phoneStatus === 'VALID' ? 'OK' :
                                           rec.phoneStatus === 'INCOMPLETE' ? 'Incompleto' :
                                           rec.phoneStatus === 'INVALID' ? 'Invalido' : 'Sin Tel'}
                                        </span>
                                      </td>
                                      <td className="p-1.5 text-center">{rec.hasValidCoords ? '✅' : '❌'}</td>
                                      <td className="p-1.5 text-center">
                                        {rec.coordsInPeru ? (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Peru</span>
                                        ) : rec.coordsOutsidePeru ? (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Fuera</span>
                                        ) : (
                                          <span className="text-gray-300">-</span>
                                        )}
                                      </td>
                                      <td className="p-1.5 text-center">{rec.hasValidAddress ? '✅' : '❌'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
