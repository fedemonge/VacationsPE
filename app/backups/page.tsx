"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface Backup {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  type: string;
}

export default function BackupsPage() {
  const { role, authenticated, loading } = useAuth();
  const router = useRouter();
  const isAdmin = role === "ADMINISTRADOR";

  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && authenticated && isAdmin) {
      loadBackups();
    }
  }, [loading, authenticated, isAdmin]);

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">Cargando...</div>
    );
  }

  if (!authenticated || !isAdmin) {
    router.push("/");
    return null;
  }

  async function loadBackups() {
    setBackupsLoading(true);
    try {
      const res = await fetch("/api/backups");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
      // ignore
    } finally {
      setBackupsLoading(false);
    }
  }

  async function handleCreateBackup() {
    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automatic: false }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: data.message });
        loadBackups();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(filename: string) {
    if (
      !confirm(
        `¿Está seguro de restaurar la base de datos desde "${filename}"?\n\nSe creará un respaldo de seguridad del estado actual antes de restaurar.\n\nIMPORTANTE: La aplicación necesitará reiniciarse después de la restauración.`
      )
    )
      return;

    setMessage(null);

    try {
      const res = await fetch("/api/backups/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: data.message });
        loadBackups();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    }
  }

  async function handleDelete(filename: string) {
    if (
      !confirm(
        `¿Está seguro de eliminar el respaldo "${filename}"? Esta acción no se puede deshacer.`
      )
    )
      return;

    setMessage(null);

    try {
      const res = await fetch(
        `/api/backups?filename=${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: data.message });
        loadBackups();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    }
  }

  function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Respaldos de Base de Datos
          </h1>
          <p className="text-gray-500 text-sm">
            Gestione los respaldos de la base de datos. Los respaldos automáticos
            se generan el 1er día de cada mes.
          </p>
        </div>
        <button
          onClick={handleCreateBackup}
          className="btn-primary whitespace-nowrap"
          disabled={creating}
        >
          {creating ? "Creando..." : "Crear Respaldo Manual"}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-sm text-sm ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Archivo</th>
              <th className="table-header">Tipo</th>
              <th className="table-header">Fecha</th>
              <th className="table-header">Tamaño</th>
              <th className="table-header w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {backupsLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="table-cell text-center text-gray-400"
                >
                  Cargando...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="table-cell text-center text-gray-400"
                >
                  No hay respaldos disponibles. Cree uno usando el botón
                  superior.
                </td>
              </tr>
            ) : (
              backups.map((backup) => (
                <tr
                  key={backup.filename}
                  className="hover:bg-woden-primary-lighter"
                >
                  <td className="table-cell font-mono text-xs text-gray-700">
                    {backup.filename}
                  </td>
                  <td className="table-cell">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        backup.type === "Automático"
                          ? "bg-blue-100 text-blue-700"
                          : backup.filename.startsWith("pre_restore_")
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-woden-primary-light text-woden-primary"
                      }`}
                    >
                      {backup.filename.startsWith("pre_restore_")
                        ? "Pre-restauración"
                        : backup.type}
                    </span>
                  </td>
                  <td className="table-cell text-sm text-gray-600">
                    {formatDateTime(backup.createdAt)}
                  </td>
                  <td className="table-cell text-sm text-gray-600">
                    {backup.sizeFormatted}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-woden-primary hover:underline"
                        onClick={() => handleRestore(backup.filename)}
                      >
                        Restaurar
                      </button>
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => handleDelete(backup.filename)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-sm text-xs text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Información</p>
        <ul className="space-y-1">
          <li>
            Los respaldos automáticos se crean el 1er día de cada mes.
          </li>
          <li>
            Al restaurar un respaldo, se crea automáticamente un respaldo de
            seguridad del estado actual.
          </li>
          <li>
            Después de restaurar, la aplicación necesita reiniciarse para
            reflejar los cambios.
          </li>
        </ul>
      </div>
    </div>
  );
}
