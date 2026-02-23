"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

export default function CambiarPasswordPage() {
  const { authenticated, loading, mustChangePassword, clearMustChangePassword } =
    useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">Cargando...</div>
    );
  }

  if (!authenticated) {
    router.push("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/auth/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
      } else {
        setSuccess(data.message);
        clearMustChangePassword();
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => router.push("/"), 2000);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      {mustChangePassword && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-sm text-orange-800 text-sm">
          <p className="font-semibold mb-1">Cambio de contraseña requerido</p>
          <p>
            Por seguridad, debe cambiar su contraseña inicial antes de continuar
            usando el sistema.
          </p>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Cambiar Contraseña
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Ingrese su contraseña actual y elija una nueva contraseña.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
          <span className="block mt-1 text-xs">
            Redirigiendo al inicio...
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label-field">Contraseña Actual</label>
          <input
            type="password"
            className="input-field"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoFocus
            placeholder="Ingrese su contraseña actual"
          />
        </div>

        <div>
          <label className="label-field">Nueva Contraseña</label>
          <input
            type="password"
            className="input-field"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div>
          <label className="label-field">Confirmar Nueva Contraseña</label>
          <input
            type="password"
            className="input-field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Repita la nueva contraseña"
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            saving ||
            !currentPassword ||
            !newPassword ||
            !confirmPassword
          }
        >
          {saving ? "Actualizando..." : "Cambiar Contraseña"}
        </button>

        {!mustChangePassword && (
          <button
            type="button"
            className="w-full text-sm text-gray-400 hover:text-gray-600"
            onClick={() => router.push("/")}
          >
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}
