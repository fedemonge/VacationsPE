'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function pct(n: number, total: number) {
  if (!total) return '0%'
  return (n / total * 100).toFixed(1) + '%'
}

export default function ImportarCalidadPage() {
  const { authenticated } = useAuth()
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().split('T')[0])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{
    source: string
    fileName: string
    totalRows: number
    validPhoneRows: number
    validCoordsRows: number
    coordsInPeruRows: number
    coordsOutsidePeruRows: number
    validAddressRows: number
    extractedCoordsRows: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('receptionDate', receptionDate)

    try {
      const res = await fetch('/api/recupero/calidad-datos', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error importing file')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setUploading(false)
    }
  }

  if (!authenticated) return <div className="p-8 text-center text-gray-500">Cargando...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/recupero/calidad-datos" className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a Calidad de Datos
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">Importar Base de Clientes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Suba un archivo Excel (.xlsx) de Claro o DirecTV. El sistema detectara el formato automaticamente.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Recepcion</label>
          <input
            type="date"
            value={receptionDate}
            onChange={e => setReceptionDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
          />
          <p className="text-xs text-gray-400 mt-1">Por defecto es la fecha de hoy. Cambie si el archivo fue recibido en otra fecha.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Archivo Excel</label>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            {file ? (
              <div>
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                <button onClick={() => setFile(null)} className="text-xs text-red-500 mt-2 hover:underline">
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 mb-2">Arrastra un archivo o haz click para seleccionar</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: '#EA7704' }}
        >
          {uploading ? 'Importando...' : 'Importar y Analizar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Importacion Exitosa</h2>
              <p className="text-sm text-gray-500">
                Fuente detectada: <span className={`font-bold ${result.source === 'CLARO' ? 'text-red-600' : 'text-blue-600'}`}>
                  {result.source}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xs text-gray-500">Total Registros</div>
              <div className="text-xl font-bold">{result.totalRows}</div>
            </div>
            <div className="bg-green-50 rounded p-3">
              <div className="text-xs text-gray-500">Telefono Valido</div>
              <div className="text-xl font-bold text-green-600">
                {result.validPhoneRows} <span className="text-sm font-normal">({pct(result.validPhoneRows, result.totalRows)})</span>
              </div>
            </div>
            <div className="bg-blue-50 rounded p-3">
              <div className="text-xs text-gray-500">Coordenadas Validas</div>
              <div className="text-xl font-bold text-blue-600">
                {result.validCoordsRows} <span className="text-sm font-normal">({pct(result.validCoordsRows, result.totalRows)})</span>
              </div>
            </div>
            <div className="bg-green-50 rounded p-3 border border-green-200">
              <div className="text-xs text-gray-500">Dentro de Peru</div>
              <div className="text-xl font-bold text-green-700">
                {result.coordsInPeruRows} <span className="text-sm font-normal">({pct(result.coordsInPeruRows, result.totalRows)})</span>
              </div>
            </div>
            <div className="bg-red-50 rounded p-3 border border-red-200">
              <div className="text-xs text-gray-500">Fuera de Peru</div>
              <div className="text-xl font-bold text-red-600">
                {result.coordsOutsidePeruRows}
              </div>
            </div>
            <div className="bg-purple-50 rounded p-3">
              <div className="text-xs text-gray-500">Direccion Valida</div>
              <div className="text-xl font-bold text-purple-600">
                {result.validAddressRows} <span className="text-sm font-normal">({pct(result.validAddressRows, result.totalRows)})</span>
              </div>
            </div>
            <div className="bg-orange-50 rounded p-3">
              <div className="text-xs text-gray-500">Coords Extraidas de Texto</div>
              <div className="text-xl font-bold text-orange-600">{result.extractedCoordsRows}</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/recupero/calidad-datos')}
              className="px-4 py-2 rounded-lg text-white font-medium text-sm"
              style={{ backgroundColor: '#EA7704' }}
            >
              Ver Dashboard
            </button>
            <button
              onClick={() => { setFile(null); setResult(null) }}
              className="px-4 py-2 rounded-lg border text-gray-600 font-medium text-sm hover:bg-gray-50"
            >
              Importar Otro Archivo
            </button>
          </div>
        </div>
      )}

      {/* Format reference */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Formatos Soportados</h3>
        <div className="grid md:grid-cols-2 gap-4 text-xs text-gray-500">
          <div>
            <span className="font-medium text-red-600">Claro</span>
            <p>Columnas clave: idagenda, codcli, nomcli, direccion, distrito, tipotrabajo, tecnologia, estado</p>
            <p className="mt-1">Coordenadas: extraidas del campo direccion (embebidas en texto)</p>
            <p>Telefono: extraido de referencia/observacion</p>
          </div>
          <div>
            <span className="font-medium text-blue-600">DirecTV</span>
            <p>Columnas clave: NroCliente, NroWO, ApellidoNombre, DireccionIns, Y, X, EstadoWO</p>
            <p className="mt-1">Coordenadas: columnas Y (latitud) y X (longitud)</p>
            <p>Telefono: TelefonoParticularIns, TelefonoLaboralIns</p>
          </div>
        </div>
      </div>
    </div>
  )
}
