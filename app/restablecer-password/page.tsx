"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function RestablecerPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Request recovery form state
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [requestingSent, setRequestingSent] = useState(false);

  const hasToken = !!token && !!email;

  async function handleRequestRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryMessage(null);
    setRecoveryError(null);
    setRequestingSent(true);

    try {
      const res = await fetch("/api/auth/recuperar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecoveryError(data.error);
      } else {
        setRecoveryMessage(data.message);
        // In dev mode, show the reset URL
        if (data.resetUrl) {
          setRecoveryMessage(
            `${data.message}\n\n(Modo desarrollo) Enlace de restablecimiento:\n${data.resetUrl}`
          );
        }
      }
    } catch {
      setRecoveryError("Error de conexión");
    } finally {
      setRequestingSent(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/auth/recuperar-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, newPassword, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
      } else {
        setSuccess(data.message);
        setTimeout(() => router.push("/"), 3000);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  // If we have a token, show the reset form
  if (hasToken) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Restablecer Contraseña
        </h1>
        <p className="text-gray-500 mb-6 text-sm">
          Ingrese su nueva contraseña para la cuenta{" "}
          <span className="font-medium">{email}</span>.
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
              Redirigiendo al inicio de sesión...
            </span>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="card space-y-4">
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
              autoFocus
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
            disabled={saving || !newPassword || !confirmPassword}
          >
            {saving ? "Restableciendo..." : "Restablecer Contraseña"}
          </button>
        </form>

        <p className="text-center mt-4">
          <Link
            href="/"
            className="text-sm text-woden-primary hover:underline"
          >
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    );
  }

  // No token: show the request recovery form
  return (
    <div className="max-w-md mx-auto mt-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Recuperar Contraseña
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Ingrese su correo electrónico registrado. Si existe una cuenta, recibirá
        un enlace para restablecer su contraseña.
      </p>

      {recoveryError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {recoveryError}
        </div>
      )}

      {recoveryMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm whitespace-pre-wrap">
          {recoveryMessage}
        </div>
      )}

      <form onSubmit={handleRequestRecovery} className="card space-y-4">
        <div>
          <label className="label-field">Correo Electrónico</label>
          <input
            type="email"
            className="input-field"
            placeholder="usuario@empresa.com.pe"
            value={recoveryEmail}
            onChange={(e) => setRecoveryEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={requestingSent || !recoveryEmail.trim()}
        >
          {requestingSent ? "Enviando..." : "Enviar Enlace de Recuperación"}
        </button>
      </form>

      <p className="text-center mt-4">
        <Link
          href="/"
          className="text-sm text-woden-primary hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}

export default function RestablecerPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-20 text-gray-400">Cargando...</div>
      }
    >
      <RestablecerPasswordContent />
    </Suspense>
  );
}
