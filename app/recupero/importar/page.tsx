"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface ImportSummary {
  imported: number;
  errors: number;
  burned: number;
  outsidePeru: number;
  missingCoords: number;
}

interface ImportRecord {
  id: string;
  fileName: string;
  createdAt: string;
  importedByEmail: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
}

interface ImportProgress {
  processed: number;
  total: number;
  phase: string;
  done: boolean;
  result?: ImportSummary;
}

export default function RecuperoImportarPage() {
  const { authenticated, email, role } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // Progress tracking
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/recupero/importar");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.imports || []);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollProgress = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/recupero/importar?progressId=${id}`);
        if (res.ok) {
          const data: ImportProgress = await res.json();
          setProgress(data);

          if (data.done) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setUploading(false);

            if (data.result) {
              setSummary(data.result);
            }
            loadHistory();
          }
        }
      } catch {
        // keep polling
      }
    }, 1000);
  }, [loadHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setSummary(null);
    setUploadError(null);
    setProgress(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setSummary(null);
    setProgress({ processed: 0, total: 0, phase: "Subiendo archivo...", done: false });

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/recupero/importar", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Error del servidor (${res.status}). Intente cerrar sesión y volver a entrar.`);
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al importar archivo");
      }

      // Server returns importId and starts background processing
      setImportId(data.importId);
      setProgress({
        processed: 0,
        total: data.totalRows,
        phase: "Procesando registros...",
        done: false,
      });

      // Start polling for progress
      pollProgress(data.importId);

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error desconocido");
      setUploading(false);
      setProgress(null);
    }
  };

  const deleteImport = async (id: string) => {
    if (!window.confirm("¿Eliminar esta importación y todos sus registros?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/recupero/importar/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");
      loadHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar importación");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePurge = async () => {
    if (!confirm("¿Está seguro de eliminar TODOS los datos de Recupero? Esta acción no se puede deshacer.")) return;
    setPurging(true);
    setPurgeMessage(null);
    try {
      const res = await fetch("/api/recupero/purge", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPurgeMessage(data.message);
      setSummary(null);
      loadHistory();
    } catch (err) {
      setPurgeMessage(err instanceof Error ? err.message : "Error al purgar");
    } finally {
      setPurging(false);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.min(Math.round((progress.processed / progress.total) * 100), 100)
    : 0;

  const summaryCard = (label: string, value: number, color: string) => (
    <div className={`rounded-lg border p-4 text-center ${color}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-gray-600 mt-1">{label}</p>
    </div>
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/recupero"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Recupero</h1>
          <p className="text-gray-500 text-sm mt-1">
            Carga archivos Excel (.xlsx) o texto (.txt) con datos de recupero
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subir Archivo</h2>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archivo (.xlsx, .txt)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.txt"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#EA7704] file:text-white hover:file:bg-[#d06a03] file:cursor-pointer disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-6 py-2 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            {uploading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {uploading ? "Procesando..." : "Importar"}
          </button>
        </div>

        {/* Progress Bar */}
        {progress && !progress.done && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{progress.phase}</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #EA7704, #f59e0b)",
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {progress.processed.toLocaleString()} de {progress.total.toLocaleString()} registros
            </p>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {uploadError}
          </div>
        )}
      </div>

      {/* Admin: Purge Data */}
      {role === "ADMINISTRADOR" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-red-800">Zona de Administración</h3>
              <p className="text-xs text-red-600 mt-1">Eliminar todos los datos de Recupero para reimportar</p>
            </div>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {purging && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
              {purging ? "Eliminando..." : "Purgar Todos los Datos"}
            </button>
          </div>
          {purgeMessage && (
            <p className="mt-2 text-sm text-red-700 font-medium">{purgeMessage}</p>
          )}
        </div>
      )}

      {/* Import Summary */}
      {summary && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Resultado de Importacion</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {summaryCard("Importados", summary.imported, "bg-green-50")}
            {summaryCard("Errores", summary.errors, "bg-red-50")}
            {summaryCard("Quemadas", summary.burned, "bg-gray-100")}
            {summaryCard("Fuera de Peru", summary.outsidePeru, "bg-orange-50")}
            {summaryCard("Sin Coords", summary.missingCoords, "bg-yellow-50")}
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Historial de Importaciones</h2>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EA7704]" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No hay importaciones registradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Archivo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Importados</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Errores</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Fuente</th>
                  {role === "ADMINISTRADOR" && (
                    <th className="px-4 py-3 text-center font-medium text-gray-500">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {rec.fileName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(rec.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {rec.importedByEmail}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {rec.totalRows.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {rec.importedRows.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {rec.errorRows.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(rec as unknown as Record<string, string>).source || "MANUAL"}
                    </td>
                    {role === "ADMINISTRADOR" && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => deleteImport(rec.id)}
                          disabled={deletingId === rec.id}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Eliminar importación"
                        >
                          {deletingId === rec.id ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-600" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                          Eliminar
                        </button>
                      </td>
                    )}
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
