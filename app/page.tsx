"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const features = [
  {
    title: "Solicitar Vacaciones",
    description:
      "Crea una nueva solicitud de vacaciones con validación automática de saldo y anticipación.",
    href: "/solicitudes",
    icon: "📋",
  },
  {
    title: "Retorno Anticipado",
    description:
      "Solicita un retorno anticipado de un periodo de vacaciones activo.",
    href: "/retorno-anticipado",
    icon: "↩️",
  },
  {
    title: "Gestión de Empleados",
    description:
      "Administra la población de empleados, importa datos por CSV.",
    href: "/empleados",
    icon: "👥",
  },
  {
    title: "Panel de Aprobaciones",
    description:
      "Seguimiento en tiempo real del flujo de aprobación de solicitudes.",
    href: "/panel/aprobaciones",
    icon: "✅",
  },
  {
    title: "Saldos de Vacaciones",
    description:
      "Consulta saldos desglosados por periodo de devengamiento con control FIFO.",
    href: "/panel/saldos",
    icon: "📊",
  },
  {
    title: "Reportes",
    description:
      "Reportes de antigüedad, tiempos de aprobación y días tomados por periodo.",
    href: "/panel/reportes",
    icon: "📈",
  },
];

const ROLE_LABELS: Record<string, string> = {
  USUARIO: "Usuario",
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  GERENTE_PAIS: "Gerente País",
  RRHH: "Recursos Humanos",
};

export default function HomePage() {
  const { authenticated, loading, login, email, role, hasAccess, mustChangePassword } = useAuth();
  const router = useRouter();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) return;

    setLoginLoading(true);
    setLoginError(null);

    const result = await login(
      loginEmail.trim(),
      loginPassword || undefined
    );
    if (!result.success) {
      if (result.requiresPassword && !showPassword) {
        setShowPassword(true);
        setLoginError("Este usuario requiere contraseña.");
      } else {
        setLoginError(result.error || "Error al iniciar sesión.");
      }
    }
    setLoginLoading(false);
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">Cargando...</div>
    );
  }

  // Login form
  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Sistema de Gestión de Vacaciones
          </h1>
          <p className="text-gray-500">
            Ingrese su correo electrónico para acceder al sistema.
          </p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label className="label-field">Correo Electrónico</label>
            <input
              type="email"
              className="input-field"
              placeholder="usuario@empresa.com.pe"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          {showPassword && (
            <div>
              <label className="label-field">Contraseña</label>
              <input
                type="password"
                className="input-field"
                placeholder="Ingrese su contraseña"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loginLoading || !loginEmail.trim()}
          >
            {loginLoading ? "Ingresando..." : "Ingresar"}
          </button>

          <div className="text-center">
            <Link
              href="/restablecer-password"
              className="text-xs text-woden-primary hover:underline"
            >
              ¿Olvidó su contraseña?
            </Link>
          </div>

          <p className="text-xs text-gray-400 text-center">
            El nivel de acceso se determina según la configuración del sistema.
            Si su correo no está registrado, tendrá acceso de usuario básico.
          </p>
        </form>
      </div>
    );
  }

  // Force password change if needed
  if (mustChangePassword) {
    router.push("/cambiar-password");
    return (
      <div className="text-center py-20 text-gray-400">
        Redirigiendo a cambio de contraseña...
      </div>
    );
  }

  // Authenticated home — show features based on role
  const visibleFeatures = features.filter((f) => hasAccess(f.href));

  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Sistema de Gestión de Vacaciones
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Bienvenido, <span className="font-medium">{email}</span>.
          Su perfil:{" "}
          <span className="font-medium text-woden-primary">
            {ROLE_LABELS[role] || role}
          </span>
          .
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleFeatures.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="card hover:shadow-md hover:border-woden-primary transition-all duration-200 group"
          >
            <div className="text-3xl mb-3">{feature.icon}</div>
            <h2 className="text-lg font-semibold text-gray-900 group-hover:text-woden-primary mb-2">
              {feature.title}
            </h2>
            <p className="text-sm text-gray-500">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
