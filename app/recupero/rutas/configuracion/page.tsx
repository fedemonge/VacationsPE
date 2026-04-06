'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'

interface Agente {
  id: string
  nombre: string
  latInicio: number
  lonInicio: number
  isActive: boolean
}

interface ExportConfig {
  id: string
  name: string
  fieldOrder: string[]
  delimiter: string
  isDefault: boolean
}

const AVAILABLE_FIELDS = [
  "secuencia", "periodo", "esAgendada", "sot", "codCliente", "cliente",
  "direccion", "distrito", "departamento", "latitud", "longitud", "telefono",
  "distanciaDesdeAnteriorKm", "tiempoViajeMin", "duracionVisitaMin",
  "horaEstimadaLlegada", "horaEstimadaSalida", "sourceType"
]

export default function ConfiguracionRutasPage() {
  useAuth()

  // Config state
  const [config, setConfig] = useState<Record<string, string>>({})
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)

  // Agentes state
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [agentesLoading, setAgentesLoading] = useState(true)
  const [newAgente, setNewAgente] = useState({ nombre: '', latInicio: '', lonInicio: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', latInicio: '', lonInicio: '' })

  // Export config state
  const [exportConfigs, setExportConfigs] = useState<ExportConfig[]>([])
  const [exportLoading, setExportLoading] = useState(true)
  const [showExportEditor, setShowExportEditor] = useState(false)
  const [editExport, setEditExport] = useState<ExportConfig | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/recupero/rutas/config')
      if (res.ok) setConfig(await res.json())
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const loadAgentes = useCallback(async () => {
    try {
      const res = await fetch('/api/recupero/rutas/agentes')
      if (res.ok) setAgentes(await res.json())
    } finally {
      setAgentesLoading(false)
    }
  }, [])

  const loadExportConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/recupero/rutas/export-config')
      if (res.ok) setExportConfigs(await res.json())
    } finally {
      setExportLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
    loadAgentes()
    loadExportConfigs()
  }, [loadConfig, loadAgentes, loadExportConfigs])

  const saveConfig = async () => {
    setConfigSaving(true)
    try {
      const configs = Object.entries(config).map(([key, value]) => ({ key, value }))
      await fetch('/api/recupero/rutas/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      })
    } finally {
      setConfigSaving(false)
    }
  }

  const addAgente = async () => {
    if (!newAgente.nombre || !newAgente.latInicio || !newAgente.lonInicio) return
    const res = await fetch('/api/recupero/rutas/agentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgente),
    })
    if (res.ok) {
      setNewAgente({ nombre: '', latInicio: '', lonInicio: '' })
      loadAgentes()
    }
  }

  const updateAgente = async (id: string) => {
    await fetch(`/api/recupero/rutas/agentes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditingId(null)
    loadAgentes()
  }

  const toggleAgente = async (id: string, isActive: boolean) => {
    await fetch(`/api/recupero/rutas/agentes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    loadAgentes()
  }

  const startEdit = (a: Agente) => {
    setEditingId(a.id)
    setEditForm({
      nombre: a.nombre,
      latInicio: String(a.latInicio),
      lonInicio: String(a.lonInicio),
    })
  }

  const moveField = (config: ExportConfig, index: number, direction: -1 | 1) => {
    const newOrder = [...config.fieldOrder]
    const swapIdx = index + direction
    if (swapIdx < 0 || swapIdx >= newOrder.length) return
    ;[newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[index]]
    setEditExport({ ...config, fieldOrder: newOrder })
  }

  const saveExportConfig = async () => {
    if (!editExport) return
    if (editExport.id) {
      await fetch('/api/recupero/rutas/export-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editExport),
      })
    } else {
      await fetch('/api/recupero/rutas/export-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editExport),
      })
    }
    setShowExportEditor(false)
    setEditExport(null)
    loadExportConfigs()
  }

  const deleteExportConfig = async (id: string) => {
    await fetch(`/api/recupero/rutas/export-config?id=${id}`, { method: 'DELETE' })
    loadExportConfigs()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Configuración de Rutas</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column - Parameters */}
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">Parámetros Generales</h2>

          {configLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Velocidad Promedio (km/h)
                  </label>
                  <input
                    type="number"
                    value={config.VELOCIDAD_PROMEDIO_KMH || '25'}
                    onChange={(e) => setConfig({ ...config, VELOCIDAD_PROMEDIO_KMH: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Duración Visita (min)
                  </label>
                  <input
                    type="number"
                    value={config.DURACION_VISITA_MIN || '10'}
                    onChange={(e) => setConfig({ ...config, DURACION_VISITA_MIN: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Distancia Máxima a Siguiente Visita (km)
                </label>
                <input
                  type="number"
                  value={config.DISTANCIA_MAXIMA_KM || '10'}
                  onChange={(e) => setConfig({ ...config, DISTANCIA_MAXIMA_KM: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Periodos de Visita</h3>
                <div className="space-y-3">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <span className="text-xs font-bold text-blue-600 block mb-2">PERIODO AM</span>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <input
                        type="time"
                        value={config.PERIODO_AM_INICIO || '08:00'}
                        onChange={(e) => setConfig({ ...config, PERIODO_AM_INICIO: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      />
                      <span className="text-gray-400 text-sm">a</span>
                      <input
                        type="time"
                        value={config.PERIODO_AM_FIN || '12:00'}
                        onChange={(e) => setConfig({ ...config, PERIODO_AM_FIN: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      />
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <span className="text-xs font-bold text-orange-600 block mb-2">PERIODO PM</span>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <input
                        type="time"
                        value={config.PERIODO_PM_INICIO || '13:00'}
                        onChange={(e) => setConfig({ ...config, PERIODO_PM_INICIO: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      />
                      <span className="text-gray-400 text-sm">a</span>
                      <input
                        type="time"
                        value={config.PERIODO_PM_FIN || '17:00'}
                        onChange={(e) => setConfig({ ...config, PERIODO_PM_FIN: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={saveConfig}
                disabled={configSaving}
                className="w-full py-2.5 bg-[#EA7704] text-white rounded-lg font-medium hover:bg-[#D06A03] disabled:opacity-50 transition-colors"
              >
                {configSaving ? 'Guardando...' : 'Guardar Parámetros'}
              </button>
            </>
          )}
        </div>

        {/* Right column - Agents */}
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">Agentes de Campo</h2>

          {agentesLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Latitud</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Longitud</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Activo</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentes.map((a) => (
                      <tr key={a.id} className="border-b hover:bg-gray-50">
                        {editingId === a.id ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                value={editForm.nombre}
                                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="any"
                                value={editForm.latInicio}
                                onChange={(e) => setEditForm({ ...editForm, latInicio: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="any"
                                value={editForm.lonInicio}
                                onChange={(e) => setEditForm({ ...editForm, lonInicio: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">—</td>
                            <td className="px-3 py-2 text-center space-x-1">
                              <button
                                onClick={() => updateAgente(a.id)}
                                className="text-green-600 hover:text-green-800 text-xs font-medium"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-gray-400 hover:text-gray-600 text-xs"
                              >
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium">{a.nombre}</td>
                            <td className="px-3 py-2 text-gray-600">{a.latInicio.toFixed(6)}</td>
                            <td className="px-3 py-2 text-gray-600">{a.lonInicio.toFixed(6)}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => toggleAgente(a.id, a.isActive)}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  a.isActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {a.isActive ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => startEdit(a)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                              >
                                Editar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add agent form */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Agregar Agente</h3>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="Nombre"
                    value={newAgente.nombre}
                    onChange={(e) => setNewAgente({ ...newAgente, nombre: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitud"
                    value={newAgente.latInicio}
                    onChange={(e) => setNewAgente({ ...newAgente, latInicio: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitud"
                    value={newAgente.lonInicio}
                    onChange={(e) => setNewAgente({ ...newAgente, lonInicio: e.target.value })}
                    className="border rounded px-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={addAgente}
                  className="mt-3 px-4 py-2 bg-[#EA7704] text-white rounded-lg text-sm font-medium hover:bg-[#D06A03] transition-colors"
                >
                  Agregar Agente
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Export Configuration Section */}
      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-700">Configuración de Exportación TXT/CSV</h2>
          <button
            onClick={() => {
              setEditExport({
                id: '',
                name: '',
                fieldOrder: [...AVAILABLE_FIELDS],
                delimiter: ',',
                isDefault: false,
              })
              setShowExportEditor(true)
            }}
            className="px-3 py-1.5 bg-[#EA7704] text-white rounded-lg text-sm hover:bg-[#D06A03] transition-colors"
          >
            Nueva Configuración
          </button>
        </div>

        {exportLoading ? (
          <p className="text-gray-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Delimitador</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Campos</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Default</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {exportConfigs.map((ec) => (
                  <tr key={ec.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{ec.name}</td>
                    <td className="px-3 py-2 text-gray-600">
                      <code className="bg-gray-100 px-1.5 py-0.5 rounded">
                        {ec.delimiter === ',' ? 'coma' : ec.delimiter === ';' ? 'punto y coma' : ec.delimiter === '\t' ? 'tab' : ec.delimiter === '|' ? 'pipe' : ec.delimiter}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{ec.fieldOrder.length} campos</td>
                    <td className="px-3 py-2 text-center">
                      {ec.isDefault && <span className="text-green-600 font-medium text-xs">Default</span>}
                    </td>
                    <td className="px-3 py-2 text-center space-x-2">
                      <button
                        onClick={() => { setEditExport(ec); setShowExportEditor(true) }}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Editar
                      </button>
                      {!ec.isDefault && (
                        <button
                          onClick={() => deleteExportConfig(ec.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Export editor modal */}
        {showExportEditor && editExport && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">
                {editExport.id ? 'Editar' : 'Nueva'} Configuración de Exportación
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Nombre</label>
                  <input
                    value={editExport.name}
                    onChange={(e) => setEditExport({ ...editExport, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Delimitador</label>
                  <select
                    value={editExport.delimiter}
                    onChange={(e) => setEditExport({ ...editExport, delimiter: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value=",">Coma (,)</option>
                    <option value=";">Punto y coma (;)</option>
                    <option value="\t">Tabulador</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Orden de Campos (usar flechas para reordenar)
                  </label>
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {editExport.fieldOrder.map((field, idx) => (
                      <div key={field} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-400 mr-2">{idx + 1}.</span>
                          {field}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveField(editExport, idx, -1)}
                            disabled={idx === 0}
                            className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveField(editExport, idx, 1)}
                            disabled={idx === editExport.fieldOrder.length - 1}
                            className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => setEditExport({
                              ...editExport,
                              fieldOrder: editExport.fieldOrder.filter((_, i) => i !== idx)
                            })}
                            className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add missing fields */}
                  {AVAILABLE_FIELDS.filter(f => !editExport.fieldOrder.includes(f)).length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">Campos disponibles: </span>
                      {AVAILABLE_FIELDS.filter(f => !editExport.fieldOrder.includes(f)).map(f => (
                        <button
                          key={f}
                          onClick={() => setEditExport({
                            ...editExport,
                            fieldOrder: [...editExport.fieldOrder, f]
                          })}
                          className="inline-block mr-1 mb-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          + {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowExportEditor(false); setEditExport(null) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveExportConfig}
                  disabled={!editExport.name}
                  className="px-4 py-2 bg-[#EA7704] text-white rounded-lg text-sm font-medium hover:bg-[#D06A03] disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
