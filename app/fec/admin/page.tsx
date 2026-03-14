"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface FecArea {
  id: string;
  name: string;
  isActive: boolean;
}

interface FecRoleAssignment {
  id: string;
  role: string;
  employee: { id: string; fullName: string; email: string };
  area: { id: string; name: string } | null;
}

interface FecCompany {
  id: string;
  name: string;
  code: string;
  currency: string;
  country: string | null;
  isActive: boolean;
}

interface FecExchangeRate {
  id: string;
  currency: string;
  periodYear: number;
  periodMonth: number;
  rateToUsd: number;
}

interface FecFinancialLine {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
}

interface FecUserAccess {
  id: string;
  employee: { id: string; fullName: string; email: string };
  company: { id: string; name: string; code: string; currency: string };
}

interface Employee {
  id: string;
  fullName: string;
  email: string;
}

const CURRENCIES = ["PEN", "COP", "BRL", "USD", "EUR", "MXN", "CRC"];

const TABS = [
  { key: "areas", label: "Areas" },
  { key: "roles", label: "Roles" },
  { key: "companies", label: "Empresas" },
  { key: "rates", label: "Tipos de Cambio" },
  { key: "lines", label: "Lineas Financieras" },
  { key: "access", label: "Acceso Usuarios" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function FecAdminPage() {
  const { authenticated, role } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("areas");

  const [areas, setAreas] = useState<FecArea[]>([]);
  const [roles, setRoles] = useState<FecRoleAssignment[]>([]);
  const [companies, setCompanies] = useState<FecCompany[]>([]);
  const [exchangeRates, setExchangeRates] = useState<FecExchangeRate[]>([]);
  const [userAccess, setUserAccess] = useState<FecUserAccess[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New area form
  const [newAreaName, setNewAreaName] = useState("");
  const [creatingArea, setCreatingArea] = useState(false);

  // New role form
  const [newRoleEmployeeId, setNewRoleEmployeeId] = useState("");
  const [newRoleType, setNewRoleType] = useState<"ANALISTA_FINANCIERO" | "RESPONSABLE_AREA">("RESPONSABLE_AREA");
  const [newRoleAreaId, setNewRoleAreaId] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  // New company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCode, setNewCompanyCode] = useState("");
  const [newCompanyCurrency, setNewCompanyCurrency] = useState("USD");
  const [newCompanyCountry, setNewCompanyCountry] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);

  // New exchange rate form
  const [newRateCurrency, setNewRateCurrency] = useState("PEN");
  const [newRateYear, setNewRateYear] = useState(new Date().getFullYear());
  const [newRateMonth, setNewRateMonth] = useState(new Date().getMonth() + 1);
  const [newRateValue, setNewRateValue] = useState("");
  const [creatingRate, setCreatingRate] = useState(false);

  // Financial lines
  const [financialLines, setFinancialLines] = useState<FecFinancialLine[]>([]);
  const [newLineName, setNewLineName] = useState("");
  const [newLineType, setNewLineType] = useState<"PL" | "BS" | "CF">("PL");
  const [creatingLine, setCreatingLine] = useState(false);

  // Exchange rates sorting & filtering
  const [ratesSortField, setRatesSortField] = useState<"currency" | "periodYear" | "periodMonth" | "rateToUsd">("currency");
  const [ratesSortDir, setRatesSortDir] = useState<"asc" | "desc">("asc");
  const [ratesFilterCurrency, setRatesFilterCurrency] = useState("");
  const [ratesFilterYear, setRatesFilterYear] = useState("");

  // Inline editing for exchange rates
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // New user access form
  const [newAccessEmployeeId, setNewAccessEmployeeId] = useState("");
  const [newAccessCompanyId, setNewAccessCompanyId] = useState("");
  const [creatingAccess, setCreatingAccess] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [areasRes, rolesRes, empRes, companiesRes, ratesRes, accessRes, linesRes] = await Promise.all([
        fetch("/api/fec/areas"),
        fetch("/api/fec/roles"),
        fetch("/api/empleados"),
        fetch("/api/fec/companies"),
        fetch("/api/fec/exchange-rates"),
        fetch("/api/fec/user-access"),
        fetch("/api/fec/financial-lines"),
      ]);

      const areasData = await areasRes.json();
      const rolesData = await rolesRes.json();
      const empData = await empRes.json();
      const companiesData = await companiesRes.json();
      const ratesData = await ratesRes.json();
      const accessData = await accessRes.json();
      const linesData = await linesRes.json();

      setAreas(areasData.areas || []);
      setRoles(rolesData.roles || []);
      setEmployees(
        (empData.employees || []).map((e: Employee) => ({
          id: e.id, fullName: e.fullName, email: e.email,
        }))
      );
      setCompanies(companiesData.companies || []);
      setExchangeRates(ratesData.rates || []);
      setUserAccess(accessData.assignments || []);
      setFinancialLines(linesData.lines || []);
    } catch {
      setError("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated, loadData]);

  // --- Area CRUD ---
  async function handleCreateArea(e: React.FormEvent) {
    e.preventDefault();
    setCreatingArea(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAreaName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Area creada exitosamente");
      setNewAreaName("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando area");
    } finally {
      setCreatingArea(false);
    }
  }

  // --- Role CRUD ---
  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setCreatingRole(true);
    setError(null);

    try {
      const body: Record<string, string> = {
        employeeId: newRoleEmployeeId,
        role: newRoleType,
      };
      if (newRoleType === "RESPONSABLE_AREA") {
        body.areaId = newRoleAreaId;
      }

      const res = await fetch("/api/fec/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Rol asignado exitosamente");
      setNewRoleEmployeeId("");
      setNewRoleAreaId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error asignando rol");
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleDeleteRole(id: string) {
    if (!confirm("Esta seguro de eliminar esta asignacion de rol?")) return;

    try {
      const res = await fetch("/api/fec/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Rol eliminado");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando rol");
    }
  }

  // --- Company CRUD ---
  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    setCreatingCompany(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompanyName,
          code: newCompanyCode,
          currency: newCompanyCurrency,
          country: newCompanyCountry || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Empresa creada exitosamente");
      setNewCompanyName("");
      setNewCompanyCode("");
      setNewCompanyCurrency("USD");
      setNewCompanyCountry("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando empresa");
    } finally {
      setCreatingCompany(false);
    }
  }

  // --- Exchange Rate CRUD ---
  async function handleCreateRate(e: React.FormEvent) {
    e.preventDefault();
    setCreatingRate(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: newRateCurrency,
          periodYear: newRateYear,
          periodMonth: newRateMonth,
          rateToUsd: parseFloat(newRateValue),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Tipo de cambio guardado exitosamente");
      setNewRateValue("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando tipo de cambio");
    } finally {
      setCreatingRate(false);
    }
  }

  // --- Exchange Rate Inline Edit ---
  async function handleUpdateRate(rate: FecExchangeRate) {
    setSavingRate(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: rate.currency,
          periodYear: rate.periodYear,
          periodMonth: rate.periodMonth,
          rateToUsd: parseFloat(editingRateValue),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Tipo de cambio actualizado");
      setEditingRateId(null);
      setEditingRateValue("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando tipo de cambio");
    } finally {
      setSavingRate(false);
    }
  }

  // --- User Access CRUD ---
  async function handleCreateAccess(e: React.FormEvent) {
    e.preventDefault();
    setCreatingAccess(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/user-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: newAccessEmployeeId,
          companyId: newAccessCompanyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Acceso asignado exitosamente");
      setNewAccessEmployeeId("");
      setNewAccessCompanyId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error asignando acceso");
    } finally {
      setCreatingAccess(false);
    }
  }

  async function handleDeleteAccess(id: string) {
    if (!confirm("Esta seguro de revocar este acceso?")) return;

    try {
      const res = await fetch("/api/fec/user-access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Acceso revocado");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error revocando acceso");
    }
  }

  // --- Financial Line CRUD ---
  async function handleCreateLine(e: React.FormEvent) {
    e.preventDefault();
    setCreatingLine(true);
    setError(null);

    try {
      const res = await fetch("/api/fec/financial-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newLineType, name: newLineName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Linea financiera creada exitosamente");
      setNewLineName("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando linea financiera");
    } finally {
      setCreatingLine(false);
    }
  }

  async function handleDeleteLine(id: string) {
    if (!confirm("Esta seguro de desactivar esta linea financiera?")) return;

    try {
      const res = await fetch("/api/fec/financial-lines", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSuccess("Linea financiera desactivada");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desactivando linea financiera");
    }
  }

  // --- Exchange Rates Sorting ---
  function handleRatesSort(field: "currency" | "periodYear" | "periodMonth" | "rateToUsd") {
    if (ratesSortField === field) {
      setRatesSortDir(ratesSortDir === "asc" ? "desc" : "asc");
    } else {
      setRatesSortField(field);
      setRatesSortDir("asc");
    }
  }

  const sortedRates = [...exchangeRates]
    .filter(r => {
      if (ratesFilterCurrency && r.currency !== ratesFilterCurrency) return false;
      if (ratesFilterYear && r.periodYear !== parseInt(ratesFilterYear)) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[ratesSortField];
      const bVal = b[ratesSortField];
      if (aVal < bVal) return ratesSortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return ratesSortDir === "asc" ? 1 : -1;
      return 0;
    });

  const uniqueCurrencies = Array.from(new Set(exchangeRates.map(r => r.currency))).sort();
  const uniqueYears = Array.from(new Set(exchangeRates.map(r => r.periodYear))).sort();

  if (!authenticated) return null;

  if (role !== "ADMINISTRADOR") {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Solo administradores pueden gestionar la configuracion FEC.</p>
        <Link href="/fec" className="text-woden-primary hover:underline mt-2 inline-block">
          Volver al Pipeline
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administracion FEC</h1>
          <p className="text-gray-500 text-sm">Gestion de areas, roles, empresas, tipos de cambio y acceso</p>
        </div>
        <Link href="/fec" className="btn-secondary text-sm">
          {"\u2190"} Pipeline
        </Link>
      </div>

      {/* Alerts */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-4 font-medium underline">Cerrar</button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 font-medium underline">Cerrar</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-woden-primary text-woden-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <>
          {/* Tab 1: Areas */}
          {activeTab === "areas" && (
            <div className="max-w-2xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Areas FEC</h2>

                <form onSubmit={handleCreateArea} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    className="input-field flex-1"
                    placeholder="Nombre del area..."
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-primary" disabled={creatingArea}>
                    {creatingArea ? "..." : "+ Crear"}
                  </button>
                </form>

                {areas.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay areas definidas.</p>
                ) : (
                  <div className="space-y-2">
                    {areas.map((area) => (
                      <div
                        key={area.id}
                        className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                      >
                        <span className="text-sm font-medium text-gray-700">{area.name}</span>
                        <span className={`text-xs ${area.isActive ? "text-green-600" : "text-gray-400"}`}>
                          {area.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Roles */}
          {activeTab === "roles" && (
            <div className="max-w-2xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Roles FEC</h2>

                <form onSubmit={handleCreateRole} className="space-y-3 mb-4 p-3 bg-gray-50 rounded-sm border border-gray-100">
                  <div>
                    <label className="label-field">Empleado *</label>
                    <select
                      className="input-field"
                      value={newRoleEmployeeId}
                      onChange={(e) => setNewRoleEmployeeId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label-field">Rol *</label>
                    <select
                      className="input-field"
                      value={newRoleType}
                      onChange={(e) => setNewRoleType(e.target.value as "ANALISTA_FINANCIERO" | "RESPONSABLE_AREA")}
                    >
                      <option value="RESPONSABLE_AREA">Responsable de Area</option>
                      <option value="ANALISTA_FINANCIERO">Analista Financiero</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      El Analista Financiero tiene acceso global. El Responsable de Area solo edita las ideas de su area.
                    </p>
                  </div>

                  {newRoleType === "RESPONSABLE_AREA" && (
                    <div>
                      <label className="label-field">Area *</label>
                      <select
                        className="input-field"
                        value={newRoleAreaId}
                        onChange={(e) => setNewRoleAreaId(e.target.value)}
                        required
                      >
                        <option value="">Seleccionar...</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button type="submit" className="btn-primary w-full" disabled={creatingRole}>
                    {creatingRole ? "Asignando..." : "Asignar Rol"}
                  </button>
                </form>

                {roles.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay roles asignados.</p>
                ) : (
                  <div className="space-y-2">
                    {roles.map((r) => (
                      <div
                        key={r.id}
                        className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">{r.employee.fullName}</p>
                          <p className="text-xs text-gray-400">
                            {r.role === "ANALISTA_FINANCIERO" ? (
                              <span className="text-woden-primary font-medium">Analista Financiero (Global)</span>
                            ) : (
                              <>Responsable {"\u2014"} {r.area?.name || "Sin area"}</>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteRole(r.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Companies */}
          {activeTab === "companies" && (
            <div className="max-w-2xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Empresas FEC</h2>

                <form onSubmit={handleCreateCompany} className="space-y-3 mb-4 p-3 bg-gray-50 rounded-sm border border-gray-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-field">Nombre *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Woden Peru"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="label-field">Codigo *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="WODEN-PE"
                        value={newCompanyCode}
                        onChange={(e) => setNewCompanyCode(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-field">Moneda por defecto</label>
                      <select
                        className="input-field"
                        value={newCompanyCurrency}
                        onChange={(e) => setNewCompanyCurrency(e.target.value)}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-field">Pais</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Peru"
                        value={newCompanyCountry}
                        onChange={(e) => setNewCompanyCountry(e.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary w-full" disabled={creatingCompany}>
                    {creatingCompany ? "Creando..." : "+ Crear Empresa"}
                  </button>
                </form>

                {companies.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay empresas definidas.</p>
                ) : (
                  <div className="space-y-2">
                    {companies.map((c) => (
                      <div
                        key={c.id}
                        className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            <span className="font-mono text-woden-primary">{c.code}</span> {"\u2014"} {c.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {c.currency} {c.country ? `| ${c.country}` : ""}
                          </p>
                        </div>
                        <span className={`text-xs ${c.isActive ? "text-green-600" : "text-gray-400"}`}>
                          {c.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Exchange Rates */}
          {activeTab === "rates" && (
            <div className="max-w-3xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Tipos de Cambio</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Defina la tasa de conversion de moneda local a USD. Ejemplo: 1 PEN = 0.27 USD.
                </p>

                <form onSubmit={handleCreateRate} className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-sm border border-gray-100 items-end">
                  <div>
                    <label className="label-field text-xs">Moneda</label>
                    <select
                      className="input-field w-auto"
                      value={newRateCurrency}
                      onChange={(e) => setNewRateCurrency(e.target.value)}
                    >
                      {CURRENCIES.filter((c) => c !== "USD").map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field text-xs">Ano</label>
                    <input
                      type="number"
                      className="input-field w-24"
                      value={newRateYear}
                      onChange={(e) => setNewRateYear(parseInt(e.target.value))}
                      min="2020"
                      max="2030"
                    />
                  </div>
                  <div>
                    <label className="label-field text-xs">Mes</label>
                    <select
                      className="input-field w-auto"
                      value={newRateMonth}
                      onChange={(e) => setNewRateMonth(parseInt(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i).toLocaleDateString("es-PE", { month: "short" })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field text-xs">Tasa (1 local = X USD)</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="input-field w-32"
                      placeholder="0.27"
                      value={newRateValue}
                      onChange={(e) => setNewRateValue(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={creatingRate}>
                    {creatingRate ? "..." : "Guardar"}
                  </button>
                </form>

                {exchangeRates.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay tipos de cambio registrados.</p>
                ) : (
                  <>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <select
                      className="input-field w-auto text-sm"
                      value={ratesFilterCurrency}
                      onChange={(e) => setRatesFilterCurrency(e.target.value)}
                    >
                      <option value="">Todas las monedas</option>
                      {uniqueCurrencies.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      className="input-field w-auto text-sm"
                      value={ratesFilterYear}
                      onChange={(e) => setRatesFilterYear(e.target.value)}
                    >
                      <option value="">Todos los anos</option>
                      {uniqueYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th
                            className="table-header cursor-pointer hover:bg-woden-primary-hover hover:text-white select-none"
                            onClick={() => handleRatesSort("currency")}
                          >
                            Moneda {ratesSortField === "currency" ? (ratesSortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                          <th
                            className="table-header cursor-pointer hover:bg-woden-primary-hover hover:text-white select-none"
                            onClick={() => handleRatesSort("periodYear")}
                          >
                            Ano {ratesSortField === "periodYear" ? (ratesSortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                          <th
                            className="table-header cursor-pointer hover:bg-woden-primary-hover hover:text-white select-none"
                            onClick={() => handleRatesSort("periodMonth")}
                          >
                            Mes {ratesSortField === "periodMonth" ? (ratesSortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                          <th
                            className="table-header text-right cursor-pointer hover:bg-woden-primary-hover hover:text-white select-none"
                            onClick={() => handleRatesSort("rateToUsd")}
                          >
                            Tasa (1 local = X USD) {ratesSortField === "rateToUsd" ? (ratesSortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                          <th className="table-header text-center w-24">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRates.map((r) => (
                          <tr key={r.id} className="hover:bg-woden-primary-lighter">
                            <td className="table-cell font-medium">{r.currency}</td>
                            <td className="table-cell">{r.periodYear}</td>
                            <td className="table-cell">
                              {new Date(2000, r.periodMonth - 1).toLocaleDateString("es-PE", { month: "long" })}
                            </td>
                            <td className="table-cell text-right font-mono">
                              {editingRateId === r.id ? (
                                <input
                                  type="number"
                                  step="0.000001"
                                  className="input-field text-right text-sm w-32 inline-block"
                                  value={editingRateValue}
                                  onChange={(e) => setEditingRateValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleUpdateRate(r);
                                    if (e.key === "Escape") { setEditingRateId(null); setEditingRateValue(""); }
                                  }}
                                />
                              ) : (
                                r.rateToUsd.toFixed(6)
                              )}
                            </td>
                            <td className="table-cell text-center">
                              {editingRateId === r.id ? (
                                <div className="flex gap-1 justify-center">
                                  <button
                                    onClick={() => handleUpdateRate(r)}
                                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                                    disabled={savingRate}
                                  >
                                    {savingRate ? "..." : "Guardar"}
                                  </button>
                                  <button
                                    onClick={() => { setEditingRateId(null); setEditingRateValue(""); }}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingRateId(r.id); setEditingRateValue(r.rateToUsd.toString()); }}
                                  className="text-xs text-woden-primary hover:underline"
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Financial Lines */}
          {activeTab === "lines" && (
            <div className="max-w-2xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Lineas Financieras</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Defina las lineas financieras disponibles para clasificar ideas FEC en P&G, Balance y Flujo de Caja.
                </p>

                <form onSubmit={handleCreateLine} className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-sm border border-gray-100 items-end">
                  <div>
                    <label className="label-field text-xs">Tipo</label>
                    <select
                      className="input-field w-auto"
                      value={newLineType}
                      onChange={(e) => setNewLineType(e.target.value as "PL" | "BS" | "CF")}
                    >
                      <option value="PL">P&G (PL)</option>
                      <option value="BS">Balance (BS)</option>
                      <option value="CF">Flujo de Caja (CF)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="label-field text-xs">Nombre</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Nombre de la linea..."
                      value={newLineName}
                      onChange={(e) => setNewLineName(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={creatingLine}>
                    {creatingLine ? "..." : "+ Crear"}
                  </button>
                </form>

                {/* P&G Lines */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Lineas de P&G</h3>
                  {financialLines.filter(l => l.type === "PL").length === 0 ? (
                    <p className="text-xs text-gray-400 ml-2">Sin lineas definidas.</p>
                  ) : (
                    <div className="space-y-1">
                      {financialLines.filter(l => l.type === "PL").map((line) => (
                        <div
                          key={line.id}
                          className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                        >
                          <span className="text-sm text-gray-700">{line.name}</span>
                          <button
                            onClick={() => handleDeleteLine(line.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Balance Lines */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Lineas de Balance</h3>
                  {financialLines.filter(l => l.type === "BS").length === 0 ? (
                    <p className="text-xs text-gray-400 ml-2">Sin lineas definidas.</p>
                  ) : (
                    <div className="space-y-1">
                      {financialLines.filter(l => l.type === "BS").map((line) => (
                        <div
                          key={line.id}
                          className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                        >
                          <span className="text-sm text-gray-700">{line.name}</span>
                          <button
                            onClick={() => handleDeleteLine(line.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cash Flow Lines */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Lineas de Flujo de Caja</h3>
                  {financialLines.filter(l => l.type === "CF").length === 0 ? (
                    <p className="text-xs text-gray-400 ml-2">Sin lineas definidas.</p>
                  ) : (
                    <div className="space-y-1">
                      {financialLines.filter(l => l.type === "CF").map((line) => (
                        <div
                          key={line.id}
                          className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                        >
                          <span className="text-sm text-gray-700">{line.name}</span>
                          <button
                            onClick={() => handleDeleteLine(line.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: User Access */}
          {activeTab === "access" && (
            <div className="max-w-2xl">
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Acceso Usuarios a Empresas</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Asigne empleados a empresas para controlar el acceso a ideas FEC por empresa.
                </p>

                <form onSubmit={handleCreateAccess} className="space-y-3 mb-4 p-3 bg-gray-50 rounded-sm border border-gray-100">
                  <div>
                    <label className="label-field">Empleado *</label>
                    <select
                      className="input-field"
                      value={newAccessEmployeeId}
                      onChange={(e) => setNewAccessEmployeeId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field">Empresa *</label>
                    <select
                      className="input-field"
                      value={newAccessCompanyId}
                      onChange={(e) => setNewAccessCompanyId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={creatingAccess}>
                    {creatingAccess ? "Asignando..." : "Asignar Acceso"}
                  </button>
                </form>

                {userAccess.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay accesos asignados.</p>
                ) : (
                  <div className="space-y-2">
                    {userAccess.map((a) => (
                      <div
                        key={a.id}
                        className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-sm border border-gray-100"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">{a.employee.fullName}</p>
                          <p className="text-xs text-gray-400">
                            {a.employee.email} {"\u2192"} <span className="text-woden-primary font-medium">{a.company.code}</span> - {a.company.name}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteAccess(a.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Revocar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
