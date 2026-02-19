"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/solicitudes", label: "Solicitar Vacaciones" },
  { href: "/retorno-anticipado", label: "Retorno Anticipado" },
  { href: "/empleados", label: "Empleados" },
  { href: "/panel/aprobaciones", label: "Aprobaciones" },
  { href: "/panel/saldos", label: "Saldos" },
  { href: "/panel/reportes", label: "Reportes" },
  { href: "/configuracion", label: "Configuración" },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-woden-primary rounded-sm flex items-center justify-center">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <span className="text-woden-primary font-bold text-lg">Woden</span>
              <span className="text-gray-500 text-sm ml-2">Vacaciones</span>
            </div>
          </Link>

          {/* Desktop Nav */}
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

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 text-gray-600 hover:text-woden-primary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
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
        </nav>
      )}
    </header>
  );
}
