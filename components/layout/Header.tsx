"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const allNavItems = [
  { href: "/solicitudes", label: "Solicitar Vacaciones" },
  { href: "/retorno-anticipado", label: "Retorno Anticipado" },
  { href: "/empleados", label: "Empleados" },
  { href: "/panel/aprobaciones", label: "Aprobaciones" },
  { href: "/panel/saldos", label: "Saldos" },
  { href: "/panel/reportes", label: "Reportes" },
  { href: "/configuracion", label: "Configuración" },
];

const ROLE_LABELS: Record<string, string> = {
  USUARIO: "Usuario",
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  GERENTE_PAIS: "Gerente País",
  RRHH: "Recursos Humanos",
};

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { authenticated, email, role, logout, hasAccess } = useAuth();

  const navItems = authenticated
    ? allNavItems.filter((item) => hasAccess(item.href))
    : [];

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/woden-logo.png"
              alt="Woden"
              width={40}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <span className="text-gray-500 text-sm">Vacaciones</span>
          </Link>

          {/* Desktop Nav */}
          {authenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter rounded-sm transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {/* User Info + Logout */}
          {authenticated ? (
            <div className="hidden lg:flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-500 truncate max-w-[180px]">
                  {email}
                </p>
                <p className="text-xs font-medium text-woden-primary">
                  {ROLE_LABELS[role] || role}
                </p>
              </div>
              <button
                onClick={logout}
                className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 border border-gray-200 rounded-sm hover:border-red-300 transition-colors"
              >
                Salir
              </button>
            </div>
          ) : null}

          {/* Mobile menu button */}
          {authenticated && (
            <button
              className="lg:hidden p-2 text-gray-600 hover:text-woden-primary"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && authenticated && (
        <nav className="lg:hidden border-t border-gray-200 bg-white">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-3 text-sm text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter border-b border-gray-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {/* Mobile user info */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">{email}</p>
            <p className="text-xs font-medium text-woden-primary">
              {ROLE_LABELS[role] || role}
            </p>
            <button
              onClick={logout}
              className="mt-2 text-xs text-red-500 hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
