"use client";

import { useState, useEffect } from "react";

interface Config {
  id: string;
  key: string;
  value: string;
  description: string;
}

export default function ConfiguracionPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracion");
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(key: string) {
    try {
      const res = await fetch("/api/configuracion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });

      if (res.ok) {
        setSuccess(`Configuración "${key}" actualizada.`);
        setEditingKey(null);
        loadConfigs();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Configuración del Sistema
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Parámetros configurables del sistema: aprobadores, webhooks y reglas de
        negocio.
      </p>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Clave</th>
              <th className="table-header">Valor</th>
              <th className="table-header">Descripción</th>
              <th className="table-header w-24">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="table-cell text-center text-gray-400">
                  Cargando...
                </td>
              </tr>
            ) : (
              configs.map((config) => (
                <tr key={config.key} className="hover:bg-woden-primary-lighter">
                  <td className="table-cell font-mono text-xs text-woden-primary">
                    {config.key}
                  </td>
                  <td className="table-cell">
                    {editingKey === config.key ? (
                      <input
                        type="text"
                        className="input-field text-sm"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm">{config.value}</span>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-400">
                    {config.description}
                  </td>
                  <td className="table-cell">
                    {editingKey === config.key ? (
                      <div className="flex gap-1">
                        <button
                          className="text-xs text-green-600 hover:underline"
                          onClick={() => handleSave(config.key)}
                        >
                          Guardar
                        </button>
                        <button
                          className="text-xs text-gray-400 hover:underline"
                          onClick={() => setEditingKey(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-xs text-woden-primary hover:underline"
                        onClick={() => {
                          setEditingKey(config.key);
                          setEditValue(config.value);
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
