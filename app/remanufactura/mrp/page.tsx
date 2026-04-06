"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DashboardStats {
  equipmentCount: number;
  materialCount: number;
  supplierCount: number;
  latestRun: { id: string; name: string; status: string; createdAt: string } | null;
  demandByMonth: { month: number; year: number; total: number }[];
  productionByMonth: { month: number; year: number; total: number }[];
  headcountByMonth: { month: number; year: number; general: number; specialist: number }[];
  alerts: { type: string; severity: string; message: string; month: number; year: number }[];
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatMonthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function SkeletonCard() {
  return <div className="card animate-pulse"><div className="h-4 bg-gray-200 rounded w-1/2 mb-3" /><div className="h-8 bg-gray-200 rounded w-3/4" /></div>;
}

function SkeletonChart() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-64 bg-gray-100 rounded" />
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-gray-100 rounded" />
      ))}
    </div>
  );
}

export default function MRPDashboardPage() {
  const { authenticated } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    fetch("/api/remanufactura/mrp/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar dashboard");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => console.error("Error fetching MRP dashboard:", e))
      .finally(() => setLoading(false));
  }, [authenticated]);

  if (!authenticated) {
    return (
      <div className="p-8 text-center text-gray-500">
        Inicia sesión para acceder al MRP.
      </div>
    );
  }

  // Merge demand + production into a single dataset for the AreaChart
  const demandProductionData = (() => {
    if (!data) return [];
    const map = new Map<string, { label: string; demanda: number; produccion: number }>();
    for (const d of (data.demandByMonth || [])) {
      const key = `${d.year}-${d.month}`;
      const label = formatMonthLabel(d.month, d.year);
      if (!map.has(key)) map.set(key, { label, demanda: 0, produccion: 0 });
      map.get(key)!.demanda = d.total;
    }
    for (const p of (data.productionByMonth || [])) {
      const key = `${p.year}-${p.month}`;
      const label = formatMonthLabel(p.month, p.year);
      if (!map.has(key)) map.set(key, { label, demanda: 0, produccion: 0 });
      map.get(key)!.produccion = p.total;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  })();

  const headcountData = (data?.headcountByMonth || [])
    .map((h) => ({
      label: formatMonthLabel(h.month, h.year),
      general: h.general,
      especialista: h.specialist,
      sortKey: `${h.year}-${String(h.month).padStart(2, "0")}`,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const severityColor: Record<string, string> = {
    critical: "border-red-500 bg-red-50 text-red-800",
    warning: "border-yellow-500 bg-yellow-50 text-yellow-800",
    info: "border-teal-500 bg-teal-50 text-teal-800",
  };

  const severityDot: Record<string, string> = {
    critical: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-teal-500",
  };

  const quickActions = [
    { label: "Ejecutar MRP", href: "/remanufactura/mrp/corridas", icon: "▶" },
    { label: "Cargar Pronóstico", href: "/remanufactura/mrp/datos-maestros", icon: "📊" },
    { label: "Actualizar Inventario", href: "/remanufactura/mrp/datos-maestros", icon: "📦" },
    { label: "Ver Reportes", href: "/remanufactura/mrp/reportes", icon: "📋" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MRP — Planificación de Remanufactura</h1>
          <p className="text-sm text-gray-500 mt-1">
            Panel de control para planificación de materiales y recursos
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/remanufactura/mrp/configuracion" className="btn-secondary text-sm px-4 py-2">
            Configuración
          </Link>
          <Link href="/remanufactura" className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50">
            Volver a Remanufactura
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Equipos Activos</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {(data?.equipmentCount ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="card">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Materiales</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {(data?.materialCount ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="card">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Proveedores Activos</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {(data?.supplierCount ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="card">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Última Corrida MRP</p>
            {data?.latestRun ? (
              <div className="mt-2">
                <p className="text-lg font-bold text-gray-900">{data.latestRun.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                    data.latestRun.status === "completada"
                      ? "bg-green-100 text-green-700"
                      : data.latestRun.status === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {data.latestRun.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(data.latestRun.createdAt).toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-lg text-gray-400 mt-2">Sin corridas</p>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Demanda vs Producción */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Demanda vs Producción</h2>
            {demandProductionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={demandProductionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="demanda"
                    name="Demanda"
                    stroke="#0891b2"
                    fill="#0891b2"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="produccion"
                    name="Producción"
                    stroke="#16a34a"
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                Sin datos de demanda/producción
              </div>
            )}
          </div>

          {/* Pronóstico de Dotación */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Pronóstico de Dotación</h2>
            {headcountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={headcountData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="general" name="General" stackId="hc" fill="#EA7704" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="especialista" name="Especialista" stackId="hc" fill="#0F2D3A" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                Sin datos de dotación
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom row: Alerts + Quick Actions */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><SkeletonList /></div>
          <SkeletonList />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts */}
          <div className="lg:col-span-2 card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Alertas Recientes</h2>
            {(data?.alerts?.length ?? 0) > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {data!.alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-sm border-l-4 ${severityColor[alert.severity] || severityColor.info}`}
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${severityDot[alert.severity] || severityDot.info}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <p className="text-xs opacity-70 mt-0.5">
                        {formatMonthLabel(alert.month, alert.year)} &middot; {alert.type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No hay alertas pendientes.</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Acciones Rápidas</h2>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-sm border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors group"
                >
                  <span className="text-lg">{action.icon}</span>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-orange-700">
                    {action.label}
                  </span>
                  <span className="ml-auto text-gray-400 group-hover:text-orange-500">&rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
