"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface ImportRecord {
  id: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  createdAt: string;
  _count?: { ordenes: number };
}

interface ImportProgress {
  processed: number;
  total: number;
  phase: string;
  done: boolean;
  result?: { imported: number; updated: number; errors: number; totalRows: number };
}

export default function PostventaImportarPage() {
  const { role } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/postventa/importar");
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const pollProgress = useCallback(
    (importId: string) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/postventa/importar?progressId=${importId}`);
          if (!res.ok) return;
          const data: ImportProgress = await res.json();
          setProgress(data);

          if (data.done) {
            clearInterval(interval);
            setUploading(false);
            loadHistory();
          }
        } catch {
          clearInterval(interval);
          setUploading(false);
        }
      }, 1000);
      return () => clearInterval(interval);
    },
    [loadHistory]
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/postventa/importar", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al importar");
        setUploading(false);
        return;
      }

      setProgress({ processed: 0, total: data.totalRows, phase: "Iniciando...", done: false });
      pollProgress(data.importId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta importación y todas sus órdenes?")) return;
    try {
      const res = await fetch(`/api/postventa/importar/${id}`, { method: "DELETE" });
      if (res.ok) loadHistory();
    } catch {
      // ignore
    }
  };

  const handlePurge = async () => {
    if (!confirm("¿Eliminar TODOS los datos de Postventa? Esta acción no se puede deshacer.")) return;
    for (const imp of imports) {
      await fetch(`/api/postventa/importar/${imp.id}`, { method: "DELETE" });
    }
    loadHistory();
  };

  const progressPct = progress ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Importar Datos Postventa</h1>
          <p className="text-gray-500 text-sm mt-1">
            Carga archivos TXT con datos de órdenes de servicio postventa
          </p>
        </div>
        <Link href="/postventa" className="btn-secondary text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
          ← Dashboard
        </Link>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Cargar Archivo</h2>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".txt,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={uploading}
            className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-light file:text-primary hover:file:bg-orange-100"
          />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary px-6 py-2 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: uploading ? "#9ca3af" : "#EA7704" }}
          >
            {uploading ? "Procesando..." : "Importar"}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Progress Bar */}
        {progress && !progress.done && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{progress.phase}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%`, backgroundColor: "#EA7704" }}
              />
            </div>
          </div>
        )}

        {/* Summary */}
        {progress?.done && progress.result && (
          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{progress.result.imported}</div>
              <div className="text-xs text-green-600">Nuevas</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{progress.result.updated}</div>
              <div className="text-xs text-blue-600">Actualizadas</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{progress.result.errors}</div>
              <div className="text-xs text-red-600">Errores</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-700">{progress.result.totalRows}</div>
              <div className="text-xs text-gray-600">Total Filas</div>
            </div>
          </div>
        )}
      </div>

      {/* Import History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Historial de Importaciones</h2>
          {role === "ADMINISTRADOR" && imports.length > 0 && (
            <button onClick={handlePurge} className="text-sm text-red-600 hover:text-red-800">
              Purgar Todo
            </button>
          )}
        </div>

        {imports.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay importaciones registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Archivo</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Filas</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Importadas</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Errores</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-xs">{imp.fileName}</td>
                    <td className="py-2 px-3 text-right">{imp.totalRows.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-green-700">{imp.importedRows.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-red-600">{imp.errorRows}</td>
                    <td className="py-2 px-3 text-gray-500">
                      {new Date(imp.createdAt).toLocaleString("es-PE")}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => handleDelete(imp.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
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
