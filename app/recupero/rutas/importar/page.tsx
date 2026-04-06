'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'

interface ImportRecord {
  id: string
  fileName: string
  totalRows: number
  importedRows: number
  errorRows: number
  importedByEmail: string | null
  createdAt: string
}

interface ImportResult {
  importId: string
  totalRows: number
  imported: number
  errorCount: number
  errorDetails: string[]
  fechasAgenda: string[]
  agentesCC: number
  proyectos: string[]
  withCoords: number
  withoutCoords: number
}

export default function ImportarAgendasPage() {
  useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)

  const loadImports = useCallback(async () => {
    try {
      const res = await fetch('/api/recupero/rutas/agendas')
      if (res.ok) setImports(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadImports()
  }, [loadImports])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/recupero/rutas/agendas', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al importar')
        return
      }

      setResult(data)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      loadImports()
    } catch (err) {
      setError(`Error: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta importación y todos sus registros?')) return
    await fetch(`/api/recupero/rutas/agendas/${id}`, { method: 'DELETE' })
    loadImports()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Importar Score Agendas</h1>
        <Link
          href="/recupero/rutas"
          className="text-sm text-[#EA7704] hover:underline"
        >
          ← Volver a Rutas
        </Link>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Cargar Archivo</h2>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="flex-1 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#EA7704] file:text-white hover:file:bg-[#D06A03]"
          />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-6 py-2.5 bg-[#EA7704] text-white rounded-lg font-medium hover:bg-[#D06A03] disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Importando...' : 'Importar'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{result.totalRows}</div>
                <div className="text-xs text-blue-600">Total Filas</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{result.imported}</div>
                <div className="text-xs text-green-600">Importados</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-700">{result.withCoords}</div>
                <div className="text-xs text-purple-600">Con Coordenadas</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-700">{result.withoutCoords}</div>
                <div className="text-xs text-red-600">Sin Coordenadas</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <div><strong>Fechas de Agenda:</strong> {result.fechasAgenda.join(', ') || 'N/A'}</div>
              <div><strong>Agentes Contact Center:</strong> {result.agentesCC}</div>
              <div><strong>Proyectos:</strong> {result.proyectos.join(', ') || 'N/A'}</div>
            </div>

            {/* Error Details Section */}
            {result.errorCount > 0 && (
              <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-red-700">
                    Errores de Importación ({result.errorCount})
                  </h3>
                  <button
                    onClick={() => {
                      const text = result.errorDetails.join('\n')
                      const blob = new Blob([text], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'errores_importacion.txt'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium underline"
                  >
                    Descargar errores (.txt)
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {result.errorDetails.map((err, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs bg-white rounded px-3 py-2 border border-red-100"
                    >
                      <span className="text-red-400 font-mono shrink-0">{idx + 1}.</span>
                      <span className="text-red-800">{err}</span>
                    </div>
                  ))}
                  {result.errorCount > result.errorDetails.length && (
                    <div className="text-xs text-red-500 italic px-3 py-1">
                      ... y {result.errorCount - result.errorDetails.length} errores más (descargue el archivo para ver todos)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import History */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Historial de Importaciones</h2>

        {loading ? (
          <p className="text-gray-400">Cargando...</p>
        ) : imports.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay importaciones aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Archivo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Importados</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Errores</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Usuario</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{imp.fileName}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(imp.createdAt).toLocaleDateString('es-PE', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-3 py-2 text-right">{imp.totalRows.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-green-600 font-medium">
                      {imp.importedRows.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-red-600">
                      {imp.errorRows > 0 ? imp.errorRows.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{imp.importedByEmail || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDelete(imp.id)}
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
