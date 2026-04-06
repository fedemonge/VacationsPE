"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface NavItem {
  href: string;
  label: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

interface NavGroup {
  label: string;
  megaMenu?: boolean; // renders as wide multi-column panel
  sections?: NavSection[]; // for mega-menu
  items?: NavItem[]; // for regular dropdown
}

const navGroups: NavGroup[] = [
  {
    label: "Vacaciones",
    megaMenu: true,
    sections: [
      {
        heading: "Solicitudes",
        items: [
          { href: "/solicitudes", label: "Solicitud de Vacaciones" },
          { href: "/retorno-anticipado", label: "Retorno Anticipado" },
          { href: "/vacaciones-dinero", label: "Días en Dinero" },
          { href: "/panel/aprobaciones", label: "Aprobaciones" },
        ],
      },
      {
        heading: "Gestión",
        items: [
          { href: "/empleados", label: "Empleados" },
          { href: "/panel/saldos", label: "Saldos" },
          { href: "/panel/reportes", label: "Reportes" },
        ],
      },
      {
        heading: "Personal",
        items: [
          { href: "/organigrama", label: "Organigrama" },
          { href: "/solicitudes-personal", label: "Solicitud de Personal" },
          { href: "/panel/personal", label: "Panel de Personal" },
        ],
      },
      {
        heading: "Configuración",
        items: [
          { href: "/configuracion", label: "Parámetros y Usuarios" },
        ],
      },
    ],
  },
  {
    label: "Planilla Peru",
    items: [
      { href: "/planilla/calcular", label: "Calcular Planilla" },
      { href: "/planilla", label: "Periodos" },
      { href: "/planilla/asistencia", label: "Asistencia" },
      { href: "/planilla/batches", label: "Lotes de Pago" },
      { href: "/planilla/excepciones", label: "Excepciones" },
      { href: "/planilla/validacion", label: "Validación Planilla" },
    ],
  },
  {
    label: "FEC",
    items: [
      { href: "/fec", label: "Pipeline de Ideas" },
      { href: "/fec/reportes", label: "Reportes FEC" },
      { href: "/fec/admin", label: "Admin FEC" },
    ],
  },
  {
    label: "Recupero",
    megaMenu: true,
    sections: [
      {
        heading: "Servicios de Campo",
        items: [
          { href: "/recupero", label: "Mapa de Operaciones" },
          { href: "/recupero/reportes", label: "Reportes" },
          { href: "/recupero/importar", label: "Importar Datos" },
        ],
      },
      {
        heading: "Contact Center",
        items: [
          { href: "/recupero/calidad-datos", label: "Calidad de Datos" },
          { href: "/recupero/calidad-datos/importar", label: "Importar Base Clientes" },
          { href: "/recupero/calidad-datos/dashboard", label: "Dashboard Interno" },
          { href: "/recupero/calidad-datos/reporte", label: "Reporte Cliente" },
        ],
      },
      {
        heading: "Rutas",
        items: [
          { href: "/recupero/rutas", label: "Programación de Rutas" },
          { href: "/recupero/rutas/configuracion", label: "Configuración" },
          { href: "/recupero/rutas/importar", label: "Importar Agendas" },
          { href: "/recupero/cobertura", label: "Cobertura de Bases" },
        ],
      },
    ],
  },
  {
    label: "Remanufactura",
    megaMenu: true,
    sections: [
      {
        heading: "Análisis",
        items: [
          { href: "/remanufactura", label: "Dashboard" },
          { href: "/remanufactura/reportes", label: "Reportes" },
          { href: "/remanufactura/importar", label: "Importar Datos" },
        ],
      },
      {
        heading: "MRP",
        items: [
          { href: "/remanufactura/mrp", label: "Dashboard MRP" },
          { href: "/remanufactura/mrp/datos-maestros", label: "Datos Maestros" },
          { href: "/remanufactura/mrp/planificacion", label: "Planificación" },
          { href: "/remanufactura/mrp/corridas", label: "Corridas MRP" },
          { href: "/remanufactura/mrp/reportes", label: "Reportes MRP" },
          { href: "/remanufactura/mrp/configuracion", label: "Configuración" },
        ],
      },
    ],
  },
  {
    label: "Configuración",
    items: [
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
  OFICIAL_SEGURIDAD: "Oficial de Seguridad",
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

function MegaMenuDropdown({
  group,
  hasAccess,
}: {
  group: NavGroup;
  hasAccess: (path: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const visibleSections = (group.sections || [])
    .map((s) => ({ ...s, items: s.items.filter((i) => hasAccess(i.href)) }))
    .filter((s) => s.items.length > 0);

  if (visibleSections.length === 0) return null;

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
        <div className={`absolute top-full left-0 mt-1 bg-white rounded-sm shadow-lg border border-gray-200 py-4 z-50 ${
          visibleSections.length <= 2 ? 'w-[360px]' : 'w-[580px]'
        }`}>
          <div className={`grid gap-0 divide-x divide-gray-100 ${
            visibleSections.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'
          }`}>
            {visibleSections.map((section) => (
              <div key={section.heading} className="px-4">
                <p className="text-xs font-semibold text-woden-primary uppercase tracking-wide mb-2">
                  {section.heading}
                </p>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block py-1.5 text-sm text-gray-600 hover:text-woden-primary transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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

  const visibleItems = (group.items || []).filter((item) => hasAccess(item.href));
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
  const [mobileExpandedSection, setMobileExpandedSection] = useState<string | null>(null);
  const { authenticated, email, role, logout, hasAccess } = useAuth();
  const pathname = usePathname();

  function getSectionName(): string {
    if (pathname?.startsWith("/remanufactura")) return "Remanufactura";
    if (pathname?.startsWith("/recupero")) return "Recupero";
    if (pathname?.startsWith("/fec")) return "FEC";
    if (pathname?.startsWith("/planilla")) return "Planilla Peru";
    if (
      pathname?.startsWith("/solicitudes-personal") ||
      pathname?.startsWith("/panel/personal") ||
      pathname?.startsWith("/organigrama")
    )
      return "Vacaciones";
    if (
      pathname?.startsWith("/solicitudes") ||
      pathname?.startsWith("/retorno-anticipado") ||
      pathname?.startsWith("/vacaciones-dinero") ||
      pathname?.startsWith("/panel/aprobaciones") ||
      pathname?.startsWith("/panel/saldos") ||
      pathname?.startsWith("/panel/reportes") ||
      pathname?.startsWith("/empleados")
    )
      return "Vacaciones";
    if (pathname?.startsWith("/configuracion") || pathname?.startsWith("/backups") || pathname?.startsWith("/cambiar-password"))
      return "Configuración";
    return "Sistemas de Gestión";
  }

  function toggleMobileGroup(label: string) {
    setMobileExpandedGroup((prev) => (prev === label ? null : label));
    setMobileExpandedSection(null);
  }

  function toggleMobileSection(heading: string) {
    setMobileExpandedSection((prev) => (prev === heading ? null : heading));
  }

  // Build visible groups for desktop
  const visibleGroups = navGroups.filter((group) => {
    if (group.megaMenu) {
      return (group.sections || []).some((s) =>
        s.items.some((i) => hasAccess(i.href))
      );
    }
    return (group.items || []).some((i) => hasAccess(i.href));
  });

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
            <span className="text-gray-500 text-sm hidden sm:inline">{getSectionName()}</span>
          </Link>

          {/* Desktop Nav */}
          {authenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              {visibleGroups.map((group) =>
                group.megaMenu ? (
                  <MegaMenuDropdown key={group.label} group={group} hasAccess={hasAccess} />
                ) : (
                  <DesktopDropdown key={group.label} group={group} hasAccess={hasAccess} />
                )
              )}
            </nav>
          )}

          {/* User Info + Logout (Desktop) */}
          {authenticated ? (
            <div className="hidden lg:flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-500 truncate max-w-[180px]">{email}</p>
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
                setMobileExpandedSection(null);
              }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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

              {mobileExpandedGroup === group.label && group.megaMenu && (
                <div className="bg-gray-50">
                  {(group.sections || []).map((section) => {
                    const visibleItems = section.items.filter((i) => hasAccess(i.href));
                    if (visibleItems.length === 0) return null;
                    return (
                      <div key={section.heading}>
                        <button
                          onClick={() => toggleMobileSection(section.heading)}
                          className="w-full flex items-center justify-between pl-6 pr-4 py-2.5 text-xs font-semibold text-woden-primary uppercase tracking-wide hover:bg-woden-primary-lighter border-b border-gray-100 transition-colors"
                        >
                          {section.heading}
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                              mobileExpandedSection === section.heading ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {mobileExpandedSection === section.heading && (
                          <div>
                            {visibleItems.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="block pl-10 pr-4 py-3 text-sm text-gray-600 hover:text-woden-primary hover:bg-woden-primary-lighter border-b border-gray-100 transition-colors"
                                onClick={() => {
                                  setMobileMenuOpen(false);
                                  setMobileExpandedGroup(null);
                                  setMobileExpandedSection(null);
                                }}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {mobileExpandedGroup === group.label && !group.megaMenu && (
                <div className="bg-gray-50">
                  {(group.items || []).filter((i) => hasAccess(i.href)).map((item) => (
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
            <p className="text-xs font-medium text-woden-primary">{ROLE_LABELS[role] || role}</p>
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
