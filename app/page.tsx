"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface FeatureGroup {
  section: string;
  items: { title: string; description: string; href: string; icon: string }[];
}

const featureGroups: FeatureGroup[] = [
  {
    section: "Vacaciones",
    items: [
      {
        title: "Solicitar Vacaciones",
        description: "Nueva solicitud con validación de saldo y anticipación.",
        href: "/solicitudes",
        icon: "📋",
      },
      {
        title: "Retorno Anticipado",
        description: "Retorno anticipado de un periodo de vacaciones activo.",
        href: "/retorno-anticipado",
        icon: "↩️",
      },
      {
        title: "Días en Dinero",
        description: "Solicitar cash-out de días de vacaciones acumulados.",
        href: "/vacaciones-dinero",
        icon: "💰",
      },
      {
        title: "Aprobaciones",
        description: "Flujo de aprobación de solicitudes en tiempo real.",
        href: "/panel/aprobaciones",
        icon: "✅",
      },
      {
        title: "Saldos",
        description: "Saldos por periodo de devengamiento con control FIFO.",
        href: "/panel/saldos",
        icon: "📊",
      },
    ],
  },
  {
    section: "Gestión",
    items: [
      {
        title: "Empleados",
        description: "Maestro de empleados, datos de planilla, turnos e importación CSV.",
        href: "/empleados",
        icon: "👥",
      },
      {
        title: "Reportes",
        description: "Antigüedad, tiempos de aprobación y días tomados.",
        href: "/panel/reportes",
        icon: "📈",
      },
      {
        title: "Configuración",
        description: "Usuarios, roles, centros de costos y parámetros.",
        href: "/configuracion",
        icon: "⚙️",
      },
    ],
  },
  {
    section: "Personal",
    items: [
      {
        title: "Organigrama",
        description: "Visualización jerárquica de la organización.",
        href: "/organigrama",
        icon: "🏢",
      },
      {
        title: "Solicitud de Personal",
        description: "Nueva posición o contratación con aprobación 3 niveles.",
        href: "/solicitudes-personal",
        icon: "📝",
      },
      {
        title: "Panel de Personal",
        description: "KPIs, aprobaciones y reportes de headcount.",
        href: "/panel/personal",
        icon: "📉",
      },
    ],
  },
  {
    section: "Planilla",
    items: [
      {
        title: "Calcular Planilla",
        description: "Motor de cálculo de remuneraciones con reglas peruanas.",
        href: "/planilla/calcular",
        icon: "🧮",
      },
      {
        title: "Periodos",
        description: "Gestión de periodos de nómina y detalle por empleado.",
        href: "/planilla",
        icon: "📅",
      },
      {
        title: "Asistencia",
        description: "Importación biométrica, cálculo de HE y tardanzas.",
        href: "/planilla/asistencia",
        icon: "⏱️",
      },
      {
        title: "Lotes de Pago",
        description: "Batches, aprobación de pago y archivo BBVA.",
        href: "/planilla/batches",
        icon: "🏦",
      },
      {
        title: "Excepciones",
        description: "Ajustes manuales y registro de excepciones.",
        href: "/planilla/excepciones",
        icon: "⚠️",
      },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  USUARIO: "Usuario",
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  GERENTE_PAIS: "Gerente General",
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
            Sistemas de Gestión
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

  // Authenticated home — show features based on role, grouped by section
  const visibleGroups = featureGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((f) => hasAccess(f.href)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Sistemas de Gestión
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

      {/* Feature Cards grouped by section */}
      {visibleGroups.map((group) => (
        <div key={group.section} className="mb-8">
          <h2 className="text-lg font-bold text-gray-700 mb-4 border-b border-gray-200 pb-2">
            {group.section}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {group.items.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="card hover:shadow-md hover:border-woden-primary transition-all duration-200 group"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-woden-primary mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500">{feature.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
