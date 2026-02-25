"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Solicitudes",
    items: [
      { href: "/solicitudes", label: "Solicitud de Vacaciones" },
      { href: "/retorno-anticipado", label: "Retorno Anticipado" },
      { href: "/vacaciones-dinero", label: "Días en Dinero" },
      { href: "/panel/aprobaciones", label: "Aprobaciones" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/empleados", label: "Empleados" },
      { href: "/panel/saldos", label: "Saldos" },
      { href: "/panel/reportes", label: "Reportes" },
    ],
  },
  {
    label: "Personal",
    items: [
      { href: "/organigrama", label: "Organigrama" },
      { href: "/solicitudes-personal", label: "Solicitud de Personal" },
      { href: "/panel/personal", label: "Panel de Personal" },
    ],
  },
  {
    label: "Configuraciones",
    items: [
      { href: "/configuracion", label: "Configuración" },
      { href: "/backups", label: "Respaldos" },
      { href: "/cambiar-password", label: "Contraseña" },
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

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className || "w-3.5 h-3.5"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function DesktopDropdown({
  group,
  hasAccess,
}: {
  group: NavGroup;
  hasAccess: (path: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const visibleItems = group.items.filter((item) => hasAccess(item.href));
  if (visibleItems.length === 0) return null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
          open
            ? "text-woden-primary bg-woden-primary-lighter"
            : "text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter"
        }`}
      >
        {group.label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-sm shadow-lg border border-gray-200 py-1 z-50">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-sm text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter transition-colors"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedGroup, setMobileExpandedGroup] = useState<string | null>(null);
  const { authenticated, email, role, logout, hasAccess } = useAuth();

  function toggleMobileGroup(label: string) {
    setMobileExpandedGroup((prev) => (prev === label ? null : label));
  }

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAccess(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image
              src="/woden-logo.png"
              alt="Woden"
              width={40}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <span className="text-gray-500 text-sm hidden sm:inline">Vacaciones</span>
          </Link>

          {/* Desktop Nav */}
          {authenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              {visibleGroups.map((group) => (
                <DesktopDropdown
                  key={group.label}
                  group={group}
                  hasAccess={hasAccess}
                />
              ))}
            </nav>
          )}

          {/* User Info + Logout (Desktop) */}
          {authenticated ? (
            <div className="hidden lg:flex items-center gap-3 shrink-0">
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
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen);
                setMobileExpandedGroup(null);
              }}
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
        <nav className="lg:hidden border-t border-gray-200 bg-white max-h-[calc(100vh-4rem)] overflow-y-auto">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <button
                onClick={() => toggleMobileGroup(group.label)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-woden-primary-lighter border-b border-gray-100 transition-colors"
              >
                {group.label}
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    mobileExpandedGroup === group.label ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Group items */}
              {mobileExpandedGroup === group.label && (
                <div className="bg-gray-50">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block pl-8 pr-4 py-3 text-sm text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter border-b border-gray-100 transition-colors"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileExpandedGroup(null);
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Mobile user info */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">{email}</p>
            <p className="text-xs font-medium text-woden-primary">
              {ROLE_LABELS[role] || role}
            </p>
            <div className="mt-2 flex gap-4">
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
