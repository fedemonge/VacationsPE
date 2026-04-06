"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface MrpRunDetail {
  id: string;
  name: string;
  startMonth: number;
  startYear: number;
  horizonMonths: number;
  status: string;
  notes: string | null;
  createdAt: string;
  createdByEmail: string | null;
  purchasePlans: {
    id: string;
    month: number;
    year: number;
    inventoryInitial: number;
    quantityNeeded: number;
    quantityRecovered: number;
    quantityToPurchase: number;
    inventoryFinal: number;
    productionOutput: number;
    orderDate: string | null;
    deliveryDate: string | null;
    unitCost: number;
    totalCost: number;
    material: { id: string; code: string; name: string; mainSupplier?: { id: string; name: string } | null };
    supplierItem: { id: string; supplier: { id: string; name: string } } | null;
  }[];
  productionPlans: {
    id: string;
    month: number;
    year: number;
    unitsToProcess: number;
    laborHoursRequired: number;
    headcountRequired: number;
    isSpecialist: boolean;
    equipment: { id: string; code: string; name: string };
    subProcess: { id: string; name: string };
    shift: { id: string; name: string } | null;
  }[];
  summary: {
    totalPurchaseCost: number;
    totalLaborHours: number;
    totalHeadcount: number;
    purchaseLineItems: number;
    productionLineItems: number;
  };
}

type TabKey = "compras" | "produccion" | "dotacion" | "alertas";

interface Alert {
  type: string;
  severity: "critical" | "warning";
  message: string;
  month: number;
  year: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "compras", label: "Plan de Compras" },
  { key: "produccion", label: "Plan de Produccion" },
  { key: "dotacion", label: "Headcount" },
  { key: "alertas", label: "Alertas" },
];

function statusBadge(status: string) {
  switch (status) {
    case "APPROVED":
      return <span className="badge-aprobada">APROBADA</span>;
    case "ARCHIVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          ARCHIVADA
        </span>
      );
    default:
      return <span className="badge-pendiente">BORRADOR</span>;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE").format(value);
}

function severityBadge(severity: string) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Critico
      </span>
    );
  }
  return <span className="badge-pendiente">Advertencia</span>;
}

export default function RunDetailPage() {
  const { authenticated } = useAuth();
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const [run, setRun] = useState<MrpRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("compras");

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterComponent, setFilterComponent] = useState("");
  const [filterEquipment, setFilterEquipment] = useState<string>("");

  const fetchRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/remanufactura/mrp/run/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data);
      } else {
        console.error("Failed to fetch run");
      }
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (authenticated && runId) fetchRun();
  }, [authenticated, runId, fetchRun]);

  const updateStatus = async (newStatus: "APPROVED" | "ARCHIVED") => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/remanufactura/mrp/run/${runId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchRun();
      else alert("Error al actualizar el estado");
    } catch {
      alert("Error de conexion");
    } finally {
      setUpdating(false);
    }
  };

  // Derive alerts from data
  const alerts = useMemo<Alert[]>(() => {
    if (!run) return [];
    const result: Alert[] = [];
    const now = new Date();

    for (const pp of run.purchasePlans) {
      if (!pp.supplierItem && !(pp.material as any)?.mainSupplier) {
        result.push({
          type: "NO_SUPPLIER",
          severity: "critical",
          message: `Material ${pp.material?.code} (${pp.material?.name}) no tiene proveedor asignado`,
          month: pp.month,
          year: pp.year,
        });
      }
      if (pp.orderDate && new Date(pp.orderDate) < now) {
        result.push({
          type: "LEAD_TIME",
          severity: "warning",
          message: `Orden para ${pp.material?.code} (${pp.material?.name}) tiene fecha de orden en el pasado: ${formatDate(pp.orderDate)}`,
          month: pp.month,
          year: pp.year,
        });
      }
      if (pp.totalCost > 10000) {
        result.push({
          type: "HIGH_COST",
          severity: "warning",
          message: `Componente ${pp.material?.code} (${pp.material?.name}) tiene costo total alto: ${formatCurrency(pp.totalCost)}`,
          month: pp.month,
          year: pp.year,
        });
      }
    }

    return result;
  }, [run]);

  // Filtered purchase plans
  const filteredPurchase = useMemo(() => {
    if (!run) return [];
    return run.purchasePlans.filter((pp) => {
      if (filterMonth && `${pp.year}-${pp.month}` !== filterMonth) return false;
      if (filterComponent && !pp.material?.name.toLowerCase().includes(filterComponent.toLowerCase()) && !pp.material?.code.toLowerCase().includes(filterComponent.toLowerCase())) return false;
      return true;
    });
  }, [run, filterMonth, filterComponent]);

  // Filtered production plans
  const filteredProduction = useMemo(() => {
    if (!run) return [];
    return run.productionPlans.filter((pp) => {
      if (filterMonth && `${pp.year}-${pp.month}` !== filterMonth) return false;
      if (filterEquipment && pp.equipment.id !== filterEquipment) return false;
      return true;
    });
  }, [run, filterMonth, filterEquipment]);

  // Headcount table data
  const dotacionData = useMemo(() => {
    if (!run) return { rows: [] as { month: number; year: number; label: string; general: number; specialist: number; total: number; byShift: Record<string, number> }[], shiftNames: [] as string[], peak: { general: 0, specialist: 0, total: 0, byShift: {} as Record<string, number> } };

    const shiftSet = new Set<string>();
    const monthMap = new Map<string, { month: number; year: number; general: number; specialist: number; byShift: Record<string, number> }>();

    for (const pp of run.productionPlans) {
      const key = `${pp.year}-${pp.month}`;
      const shiftName = pp.shift?.name || "Sin Turno";
      shiftSet.add(shiftName);

      if (!monthMap.has(key)) {
        monthMap.set(key, { month: pp.month, year: pp.year, general: 0, specialist: 0, byShift: {} });
      }
      const entry = monthMap.get(key)!;
      if (pp.isSpecialist) {
        entry.specialist += pp.headcountRequired;
      } else {
        entry.general += pp.headcountRequired;
      }
      entry.byShift[shiftName] = (entry.byShift[shiftName] || 0) + pp.headcountRequired;
    }

    const shiftNames = Array.from(shiftSet).sort();
    const rows = Array.from(monthMap.values())
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((e) => ({
        ...e,
        label: `${MONTH_NAMES[e.month - 1]} ${e.year}`,
        total: e.general + e.specialist,
      }));

    const peak = {
      general: Math.max(0, ...rows.map((r) => r.general)),
      specialist: Math.max(0, ...rows.map((r) => r.specialist)),
      total: Math.max(0, ...rows.map((r) => r.total)),
      byShift: {} as Record<string, number>,
    };
    for (const s of shiftNames) {
      peak.byShift[s] = Math.max(0, ...rows.map((r) => r.byShift[s] || 0));
    }

    return { rows, shiftNames, peak };
  }, [run]);

  // Available months for filter dropdown
  const availableMonths = useMemo(() => {
    if (!run) return [];
    const set = new Set<string>();
    for (const pp of run.purchasePlans) set.add(`${pp.year}-${pp.month}`);
    for (const pp of run.productionPlans) set.add(`${pp.year}-${pp.month}`);
    return Array.from(set)
      .sort()
      .map((key) => {
        const [y, m] = key.split("-").map(Number);
        return { value: key, label: `${MONTH_NAMES[m - 1]} ${y}` };
      });
  }, [run]);

  // Available equipment for filter
  const availableEquipment = useMemo(() => {
    if (!run) return [];
    const map = new Map<string, string>();
    for (const pp of run.productionPlans) map.set(pp.equipment.id, `${pp.equipment.code} - ${pp.equipment.name}`);
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [run]);

  // Purchase totals
  const purchaseTotals = useMemo(() => {
    return {
      needed: filteredPurchase.reduce((s, p) => s + p.quantityNeeded, 0),
      recovered: filteredPurchase.reduce((s, p) => s + p.quantityRecovered, 0),
      toPurchase: filteredPurchase.reduce((s, p) => s + p.quantityToPurchase, 0),
      cost: filteredPurchase.reduce((s, p) => s + p.totalCost, 0),
    };
  }, [filteredPurchase]);

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Debe iniciar sesion para acceder a esta pagina.</div>;
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="card animate-pulse"><div className="h-6 bg-gray-200 rounded w-1/3 mb-3" /><div className="h-4 bg-gray-200 rounded w-1/4" /></div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse"><div className="h-4 bg-gray-200 rounded w-1/2 mb-2" /><div className="h-8 bg-gray-200 rounded w-3/4" /></div>
          ))}
        </div>
        <div className="card animate-pulse"><div className="h-64 bg-gray-100 rounded" /></div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Corrida MRP no encontrada.</p>
        <button className="btn-primary mt-4" onClick={() => router.push("/remanufactura/mrp/corridas")}>
          Volver a Corridas
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => router.push("/remanufactura/mrp/corridas")}
            >
              &larr; Corridas
            </button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {run.name}
            {statusBadge(run.status)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Creada {formatDate(run.createdAt)}
            {run.createdByEmail && ` por ${run.createdByEmail}`}
            {run.notes && ` | ${run.notes}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/remanufactura/mrp/corridas/${runId}/calendario`} className="btn-secondary px-4 py-2 text-sm">
            Calendario
          </Link>
          {run.status === "DRAFT" && (
            <button className="btn-primary" onClick={() => updateStatus("APPROVED")} disabled={updating}>
              Aprobar
            </button>
          )}
          {run.status === "APPROVED" && (
            <button className="btn-secondary" onClick={() => updateStatus("ARCHIVED")} disabled={updating}>
              Archivar
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Costo Total de Compras</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(run.summary.totalPurchaseCost)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Horas-Hombre Requeridas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(run.summary.totalLaborHours)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Headcount Pico</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(run.summary.totalHeadcount)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Horizonte</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {MONTH_NAMES[run.startMonth - 1]} {run.startYear} - {run.horizonMonths} meses
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-[#EA7704] text-[#EA7704]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === "alertas" && alerts.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full">
                  {alerts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "compras" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="label-field">Mes</label>
              <select className="input-field w-48" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="">Todos los meses</option>
                {availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Componente</label>
              <input
                className="input-field w-56"
                placeholder="Buscar componente..."
                value={filterComponent}
                onChange={(e) => setFilterComponent(e.target.value)}
              />
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Codigo</th>
                    <th className="table-header">Material</th>
                    <th className="table-header">Proveedor</th>
                    <th className="table-header">Mes</th>
                    <th className="table-header text-right">Inv. Inicial</th>
                    <th className="table-header text-right">Necesaria</th>
                    <th className="table-header text-right">Recuperada</th>
                    <th className="table-header text-right">A Comprar</th>
                    <th className="table-header text-right">Inv. Final</th>
                    <th className="table-header text-right">Produccion</th>
                    <th className="table-header">Fecha Orden</th>
                    <th className="table-header">Fecha Entrega</th>
                    <th className="table-header text-right">Costo Unit.</th>
                    <th className="table-header text-right">Costo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchase.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="table-cell text-center text-gray-400 py-8">
                        Sin datos de compras para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredPurchase.map((pp) => (
                        <tr key={pp.id} className="hover:bg-gray-50">
                          <td className="table-cell font-mono text-xs">{pp.material?.code}</td>
                          <td className="table-cell">{pp.material?.name}</td>
                          <td className="table-cell">{pp.supplierItem?.supplier?.name || (pp.material as any)?.mainSupplier?.name || <span className="text-red-500 text-xs">Sin proveedor</span>}</td>
                          <td className="table-cell">{MONTH_NAMES[pp.month - 1]} {pp.year}</td>
                          <td className="table-cell text-right">{formatNumber(pp.inventoryInitial ?? 0)}</td>
                          <td className="table-cell text-right">{formatNumber(pp.quantityNeeded)}</td>
                          <td className="table-cell text-right">{formatNumber(pp.quantityRecovered)}</td>
                          <td className="table-cell text-right font-medium">{formatNumber(pp.quantityToPurchase)}</td>
                          <td className="table-cell text-right">{formatNumber(pp.inventoryFinal ?? 0)}</td>
                          <td className="table-cell text-right">{formatNumber(pp.productionOutput ?? 0)}</td>
                          <td className="table-cell">{pp.orderDate ? formatDate(pp.orderDate) : "-"}</td>
                          <td className="table-cell">{pp.deliveryDate ? formatDate(pp.deliveryDate) : "-"}</td>
                          <td className="table-cell text-right">{formatCurrency(pp.unitCost)}</td>
                          <td className="table-cell text-right font-medium">{formatCurrency(pp.totalCost)}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-gray-50 font-bold">
                        <td className="table-cell" colSpan={4}>TOTAL</td>
                        <td className="table-cell text-right">{formatNumber(purchaseTotals.needed)}</td>
                        <td className="table-cell text-right">{formatNumber(purchaseTotals.recovered)}</td>
                        <td className="table-cell text-right">{formatNumber(purchaseTotals.toPurchase)}</td>
                        <td className="table-cell" colSpan={2}></td>
                        <td className="table-cell"></td>
                        <td className="table-cell text-right">{formatCurrency(purchaseTotals.cost)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "produccion" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="label-field">Mes</label>
              <select className="input-field w-48" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="">Todos los meses</option>
                {availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Equipo</label>
              <select className="input-field w-64" value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}>
                <option value="">Todos los equipos</option>
                {availableEquipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Codigo Equipo</th>
                    <th className="table-header">Equipo</th>
                    <th className="table-header">Sub-Proceso</th>
                    <th className="table-header">Turno</th>
                    <th className="table-header">Mes</th>
                    <th className="table-header text-right">Unidades</th>
                    <th className="table-header text-right">HH Requeridas</th>
                    <th className="table-header text-right">Headcount</th>
                    <th className="table-header text-center">Especialista</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProduction.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="table-cell text-center text-gray-400 py-8">
                        Sin datos de produccion para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredProduction.map((pp) => (
                      <tr key={pp.id} className="hover:bg-gray-50">
                        <td className="table-cell font-mono text-xs">{pp.equipment.code}</td>
                        <td className="table-cell">{pp.equipment.name}</td>
                        <td className="table-cell">{pp.subProcess.name}</td>
                        <td className="table-cell">{pp.shift?.name || "-"}</td>
                        <td className="table-cell">{MONTH_NAMES[pp.month - 1]} {pp.year}</td>
                        <td className="table-cell text-right">{formatNumber(pp.unitsToProcess)}</td>
                        <td className="table-cell text-right">{formatNumber(pp.laborHoursRequired)}</td>
                        <td className="table-cell text-right">{pp.headcountRequired}</td>
                        <td className="table-cell text-center">{pp.isSpecialist ? "Si" : "No"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "dotacion" && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Mes</th>
                  <th className="table-header text-right">General</th>
                  <th className="table-header text-right">Especialista</th>
                  <th className="table-header text-right">Total</th>
                  {dotacionData.shiftNames.map((s) => (
                    <th key={s} className="table-header text-right">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dotacionData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + dotacionData.shiftNames.length} className="table-cell text-center text-gray-400 py-8">
                      Sin datos de dotacion.
                    </td>
                  </tr>
                ) : (
                  <>
                    {dotacionData.rows.map((row) => (
                      <tr key={`${row.year}-${row.month}`} className="hover:bg-gray-50">
                        <td className="table-cell">{row.label}</td>
                        <td className="table-cell text-right">{row.general}</td>
                        <td className="table-cell text-right">{row.specialist}</td>
                        <td className="table-cell text-right font-medium">{row.total}</td>
                        {dotacionData.shiftNames.map((s) => (
                          <td key={s} className="table-cell text-right">{row.byShift[s] || 0}</td>
                        ))}
                      </tr>
                    ))}
                    {/* Peak row */}
                    <tr className="bg-gray-50 font-bold">
                      <td className="table-cell">PICO</td>
                      <td className="table-cell text-right">{dotacionData.peak.general}</td>
                      <td className="table-cell text-right">{dotacionData.peak.specialist}</td>
                      <td className="table-cell text-right">{dotacionData.peak.total}</td>
                      {dotacionData.shiftNames.map((s) => (
                        <td key={s} className="table-cell text-right">{dotacionData.peak.byShift[s] || 0}</td>
                      ))}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "alertas" && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="card text-center text-gray-400 py-12">
              No hay alertas para esta corrida MRP.
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Severidad</th>
                      <th className="table-header">Tipo</th>
                      <th className="table-header">Mensaje</th>
                      <th className="table-header">Periodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-cell">{severityBadge(alert.severity)}</td>
                        <td className="table-cell font-mono text-xs">{alert.type}</td>
                        <td className="table-cell">{alert.message}</td>
                        <td className="table-cell">{MONTH_NAMES[alert.month - 1]} {alert.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
