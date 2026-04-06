"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ImportRecord {
  id: string;
  source: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  importedByEmail: string | null;
  createdAt: string;
}

interface ImportResult {
  importId: string;
  source: string;
  totalRows: number;
  imported: number;
  errors: number;
}

export default function RemanufacturaImportarPage() {
  const { authenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/remanufactura/importar");
      if (res.ok) setImports(await res.json());
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchHistory();
  }, [authenticated, fetchHistory]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (source) formData.append("source", source);

      const res = await fetch("/api/remanufactura/importar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al importar");
      }

      const data = await res.json();
      setResult(data);
      setFile(null);
      fetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (importId: string) => {
    if (!confirm("¿Eliminar esta importación y todas sus transacciones?")) return;
    try {
      const res = await fetch(`/api/remanufactura/importar?importId=${importId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchHistory();
    } catch {
      // ignore
    }
  };

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Inicia sesión para acceder.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Datos — Remanufactura</h1>
          <p className="text-sm text-gray-500 mt-1">
            Carga archivos de OSCM (Histórico de Series) o WMS para consolidar datos.
          </p>
        </div>
        <Link
          href="/remanufactura"
          className="text-sm text-gray-500 hover:text-woden-primary"
        >
          ← Volver al Dashboard
        </Link>
      </div>

      {/* Upload Form */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Cargar Archivo</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fuente de Datos
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="input-field"
            >
              <option value="">Auto-detectar</option>
              <option value="OSCM">OSCM (Histórico de Series)</option>
              <option value="WMS">WMS (Warehouse Management)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Si no seleccionas, se detectará automáticamente por las columnas del archivo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archivo (XLSX, XLS, CSV)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
                setError(null);
              }}
              className="input-field text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary px-6 py-2 text-sm disabled:opacity-50"
          >
            {uploading ? "Importando..." : "Importar"}
          </button>
          {file && (
            <span className="text-sm text-gray-500">
              {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-sm">
            <p className="text-sm font-medium text-green-800">Importación exitosa</p>
            <div className="text-sm text-green-700 mt-1 space-y-0.5">
              <p>Fuente detectada: <strong>{result.source}</strong></p>
              <p>Filas procesadas: <strong>{result.totalRows.toLocaleString()}</strong></p>
              <p>Importadas: <strong>{result.imported.toLocaleString()}</strong></p>
              {result.errors > 0 && (
                <p className="text-red-600">Errores: <strong>{result.errors.toLocaleString()}</strong></p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-sm">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Format Guide */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Formatos Aceptados</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-woden-primary mb-2">OSCM — Histórico de Series</h3>
            <p className="text-xs text-gray-500 mb-2">
              Exportación del módulo de inventario Oracle. Contiene movimientos entre organizaciones.
            </p>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>Columnas esperadas:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Fecha Transacción</li>
                <li>Transacción (ID)</li>
                <li>Tipo Transacción</li>
                <li>Número Serie</li>
                <li>Código Categoría (DECO)</li>
                <li>Organización Origen/Destino</li>
                <li>Subinventario Origen/Destino</li>
                <li>Estado</li>
                <li>Elementos Transaccionados</li>
              </ul>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-woden-primary mb-2">WMS — Warehouse Management</h3>
            <p className="text-xs text-gray-500 mb-2">
              Datos del sistema de gestión de almacén con diagnóstico y reparación.
            </p>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>Columnas esperadas:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Fecha / Fecha Ingreso</li>
                <li>Código Barras / Serie</li>
                <li>Familia / Tipo Equipo</li>
                <li>Resultado Diagnóstico</li>
                <li>Tipo Falla</li>
                <li>Etapa (Diagnóstico / Reparación)</li>
                <li>Estado</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Import History */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Historial de Importaciones</h2>
        {loadingHistory ? (
          <p className="text-gray-400 text-sm">Cargando...</p>
        ) : imports.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay importaciones registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Fecha</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Fuente</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Archivo</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Filas</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Importadas</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Errores</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Usuario</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-600">
                      {new Date(imp.createdAt).toLocaleString("es-PE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          imp.source === "OSCM"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {imp.source}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-700 max-w-[200px] truncate">{imp.fileName}</td>
                    <td className="py-2 px-3 text-right">{imp.totalRows.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-green-600 font-medium">
                      {imp.importedRows.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-red-500">
                      {imp.errorRows > 0 ? imp.errorRows.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{imp.importedByEmail}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleDelete(imp.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                        title="Eliminar importación"
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
  );
}
