"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface FecCompany {
  id: string;
  name: string;
  code: string;
  currency: string;
}

interface UpcomingGroup {
  leader: { id: string; fullName: string; email: string };
  ideas: {
    id: string;
    code: string;
    title: string;
    ideaType: string;
    projectCurrency: string;
    area: { name: string };
    company: { code: string; name: string };
    implementationDate: string | null;
    revisedImplementationDate: string | null;
    annualizedValue: number;
    annualizedValueUsd: number;
    effectiveValue: number;
    effectiveValueUsd: number;
  }[];
}

interface MonthlyEntry {
  month: string;
  total: number;
  totalUsd: number;
}

interface OverdueIdea {
  id: string;
  code: string;
  title: string;
  ideaType: string;
  projectCurrency: string;
  area: { name: string };
  company: { code: string; name: string };
  leadEmployee: { fullName: string; email: string };
  implementationDate: string | null;
  revisedImplementationDate: string | null;
  effectiveValue: number;
  effectiveValueUsd: number;
}

function formatCurrency(val: number, currency = "USD") {
  const prefix = val < 0 ? "-" : "";
  const symbol = currency === "USD" ? "$" : currency;
  return prefix + symbol + " " + Math.abs(val).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = dateStr.split("T")[0]; // "YYYY-MM-DD"
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, m - 1, day); // local date, no timezone shift
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("es-PE", { month: "short", year: "numeric" });
}

export default function FecReportesPage() {
  const { authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"upcoming" | "monthly" | "overdue">("upcoming");
  const [upcomingDays, setUpcomingDays] = useState(30);

  // Companies
  const [companies, setCompanies] = useState<FecCompany[]>([]);

  // Filters
  const [filterCompany, setFilterCompany] = useState("");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState("");

  // Upcoming data
  const [upcomingGroups, setUpcomingGroups] = useState<UpcomingGroup[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);

  // Monthly data
  const [monthlyData, setMonthlyData] = useState<MonthlyEntry[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);

  // Overdue data
  const [overdueIdeas, setOverdueIdeas] = useState<OverdueIdea[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load companies on mount
  useEffect(() => {
    if (authenticated) {
      fetch("/api/fec/companies")
        .then((r) => r.json())
        .then((d) => setCompanies(d.companies || []))
        .catch(() => {});
    }
  }, [authenticated]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("type", activeTab);
      if (filterCompany) params.set("companyId", filterCompany);
      if (filterYear) params.set("year", filterYear);
      if (filterMonth) params.set("periodMonth", filterMonth);

      if (activeTab === "upcoming") {
        params.set("days", upcomingDays.toString());
        const res = await fetch(`/api/fec/reports?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUpcomingGroups(data.groups || []);
        setUpcomingTotal(data.totalIdeas || 0);
      } else if (activeTab === "monthly") {
        const res = await fetch(`/api/fec/reports?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMonthlyData(data.months || []);
        setMonthlyTotal(data.totalImplementedIdeas || 0);
      } else if (activeTab === "overdue") {
        const res = await fetch(`/api/fec/reports?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setOverdueIdeas(data.ideas || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando reporte");
    } finally {
      setLoading(false);
    }
  }, [activeTab, upcomingDays, filterCompany, filterYear, filterMonth]);

  useEffect(() => {
    if (authenticated) loadReport();
  }, [authenticated, loadReport]);

  async function handleExportXlsx() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    if (activeTab === "upcoming") {
      const rows: Record<string, unknown>[] = [];
      upcomingGroups.forEach((g) => {
        g.ideas.forEach((idea) => {
          rows.push({
            Codigo: idea.code,
            Titulo: idea.title,
            Tipo: idea.ideaType,
            Empresa: idea.company?.code || "",
            Area: idea.area.name,
            Lider: g.leader.fullName,
            "Fecha Impl.": formatDate(idea.revisedImplementationDate || idea.implementationDate),
            Moneda: idea.projectCurrency,
            "Anualizado (Local)": idea.annualizedValue,
            "Anualizado (USD)": idea.annualizedValueUsd,
          });
        });
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        ws['!cols'] = Array.from({ length: range.e.c + 1 }, () => ({ wch: 18 }));
      }
      XLSX.utils.book_append_sheet(wb, ws, "Proximas");
    } else if (activeTab === "monthly") {
      const rows = monthlyData.map((e) => ({
        Mes: formatMonth(e.month),
        "Total (Local)": e.total,
        "Total (USD)": e.totalUsd,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        ws['!cols'] = Array.from({ length: range.e.c + 1 }, () => ({ wch: 18 }));
      }
      XLSX.utils.book_append_sheet(wb, ws, "Mensual");
    } else if (activeTab === "overdue") {
      const rows = overdueIdeas.map((idea) => {
        const implDate = new Date(idea.revisedImplementationDate || idea.implementationDate || "");
        const daysOverdue = Math.floor((Date.now() - implDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          Codigo: idea.code,
          Titulo: idea.title,
          Tipo: idea.ideaType,
          Empresa: idea.company?.code || "",
          Area: idea.area.name,
          Lider: idea.leadEmployee.fullName,
          "Fecha Impl.": formatDate(idea.revisedImplementationDate || idea.implementationDate),
          "Dias Vencidos": daysOverdue,
          Moneda: idea.projectCurrency,
          "Efectivo (Local)": idea.effectiveValue,
          "Efectivo (USD)": idea.effectiveValueUsd,
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        ws['!cols'] = Array.from({ length: range.e.c + 1 }, () => ({ wch: 18 }));
      }
      XLSX.utils.book_append_sheet(wb, ws, "Vencidas");
    }

    XLSX.writeFile(wb, `FEC_Reporte_${activeTab}_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  function handleExportPdf() {
    const printContent = document.getElementById("report-print-area");
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte FEC - ${activeTab}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: 4px; color: #EA7704; }
            h2 { font-size: 14px; color: #666; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th { background: #EA7704; color: white; text-align: left; padding: 8px 10px; border: 1px solid #D06A03; font-size: 11px; }
            td { padding: 6px 8px; border: 1px solid #ddd; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background: rgba(234, 119, 4, 0.05); }
          </style>
        </head>
        <body>
          <h1>Reporte FEC - ${activeTab === "upcoming" ? "Proximas a Implementar" : activeTab === "monthly" ? "Valores Mensuales" : "Ideas Vencidas"}</h1>
          <h2>Generado: ${new Date().toLocaleDateString("es-PE")}</h2>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  if (!authenticated) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes FEC</h1>
          <p className="text-gray-500 text-sm">Reportes de Financiando el Crecimiento</p>
        </div>
        <Link href="/fec" className="btn-secondary text-sm">
          {"\u2190"} Pipeline
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="label-field text-xs">Empresa</label>
          <select
            className="input-field w-auto"
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
          >
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field text-xs">Ano</label>
          <input
            type="number"
            className="input-field w-24"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            min="2020"
            max="2030"
          />
        </div>
        <div>
          <label className="label-field text-xs">Mes</label>
          <select
            className="input-field w-auto"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i).toLocaleDateString("es-PE", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleExportXlsx} className="btn-secondary text-sm">
            Descargar XLSX
          </button>
          <button onClick={handleExportPdf} className="btn-secondary text-sm">
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: "upcoming" as const, label: "Proximas a Implementar" },
          { key: "monthly" as const, label: "Valores Mensuales" },
          { key: "overdue" as const, label: "Ideas Vencidas" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
        <div className="text-center py-12 text-gray-500">Cargando reporte...</div>
      ) : (
        <div id="report-print-area">
          {/* Upcoming report */}
          {activeTab === "upcoming" && (
            <div>
              {/* Days filter */}
              <div className="flex gap-2 mb-4">
                {[30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setUpcomingDays(d)}
                    className={`px-3 py-1 text-sm rounded-sm border ${
                      upcomingDays === d
                        ? "bg-woden-primary text-white border-woden-primary"
                        : "border-gray-300 text-gray-600 hover:border-woden-primary"
                    }`}
                  >
                    {d} dias
                  </button>
                ))}
              </div>

              <p className="text-sm text-gray-500 mb-4">
                {upcomingTotal} idea(s) con implementacion en los proximos {upcomingDays} dias
              </p>

              {upcomingGroups.length === 0 ? (
                <div className="card text-center py-8 text-gray-400">
                  No hay ideas proximas a implementar en este periodo.
                </div>
              ) : (
                upcomingGroups.map((group) => (
                  <div key={group.leader.id} className="card mb-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      {group.leader.fullName}
                      <span className="text-gray-400 ml-2 font-normal">({group.leader.email})</span>
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="table-header">Codigo</th>
                            <th className="table-header">Titulo</th>
                            <th className="table-header">Tipo</th>
                            <th className="table-header">Empresa</th>
                            <th className="table-header">Area</th>
                            <th className="table-header">Fecha Impl.</th>
                            <th className="table-header text-right">Anualizado (Local)</th>
                            <th className="table-header text-right">Anualizado (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.ideas.map((idea) => (
                            <tr key={idea.id} className="hover:bg-woden-primary-lighter">
                              <td className="table-cell font-mono text-xs">
                                <Link href={`/fec/idea?id=${idea.id}`} className="text-woden-primary hover:underline">
                                  {idea.code}
                                </Link>
                              </td>
                              <td className="table-cell">{idea.title}</td>
                              <td className="table-cell">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  idea.ideaType === "AHORRO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}>
                                  {idea.ideaType}
                                </span>
                              </td>
                              <td className="table-cell">{idea.company?.code || "\u2014"}</td>
                              <td className="table-cell">{idea.area.name}</td>
                              <td className="table-cell">{formatDate(idea.revisedImplementationDate || idea.implementationDate)}</td>
                              <td className="table-cell text-right font-medium">
                                {formatCurrency(idea.annualizedValue, idea.projectCurrency)}
                              </td>
                              <td className="table-cell text-right font-medium">
                                {formatCurrency(idea.annualizedValueUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Monthly report */}
          {activeTab === "monthly" && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Valores efectivos mensuales de {monthlyTotal} idea(s) implementada(s)
              </p>

              {monthlyData.length === 0 ? (
                <div className="card text-center py-8 text-gray-400">
                  No hay ideas implementadas con valores registrados.
                </div>
              ) : (
                <div className="card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="table-header">Mes</th>
                          <th className="table-header text-right">Total (Local)</th>
                          <th className="table-header text-right">Total (USD)</th>
                          <th className="table-header w-1/3">Visualizacion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.map((entry) => {
                          const maxVal = Math.max(...monthlyData.map((d) => Math.abs(d.total)));
                          const pct = maxVal > 0 ? (Math.abs(entry.total) / maxVal) * 100 : 0;
                          return (
                            <tr key={entry.month} className="hover:bg-woden-primary-lighter">
                              <td className="table-cell font-medium">{formatMonth(entry.month)}</td>
                              <td className={`table-cell text-right font-bold ${
                                entry.total >= 0 ? "text-green-600" : "text-red-600"
                              }`}>
                                {formatCurrency(entry.total, "Local")}
                              </td>
                              <td className={`table-cell text-right font-bold ${
                                entry.totalUsd >= 0 ? "text-green-600" : "text-red-600"
                              }`}>
                                {formatCurrency(entry.totalUsd)}
                              </td>
                              <td className="table-cell">
                                <div className="w-full bg-gray-100 rounded-full h-4">
                                  <div
                                    className="h-4 rounded-full bg-woden-primary"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grand totals */}
                  <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between flex-wrap gap-4">
                    <div>
                      <span className="font-medium text-gray-700">Total General (Local):</span>
                      <span className="font-bold text-lg ml-2">
                        {formatCurrency(monthlyData.reduce((sum, d) => sum + d.total, 0), "Local")}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Total General (USD):</span>
                      <span className="font-bold text-lg ml-2">
                        {formatCurrency(monthlyData.reduce((sum, d) => sum + d.totalUsd, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Overdue report */}
          {activeTab === "overdue" && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                {overdueIdeas.length} idea(s) FIRME con fecha de implementacion vencida
              </p>

              {overdueIdeas.length === 0 ? (
                <div className="card text-center py-8 text-gray-400">
                  No hay ideas vencidas.
                </div>
              ) : (
                <div className="card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="table-header">Codigo</th>
                          <th className="table-header">Titulo</th>
                          <th className="table-header">Tipo</th>
                          <th className="table-header">Empresa</th>
                          <th className="table-header">Area</th>
                          <th className="table-header">Lider</th>
                          <th className="table-header">Fecha Impl.</th>
                          <th className="table-header">Dias Vencidos</th>
                          <th className="table-header text-right">Efectivo (Local)</th>
                          <th className="table-header text-right">Efectivo (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overdueIdeas.map((idea) => {
                          const implDate = new Date(idea.revisedImplementationDate || idea.implementationDate || "");
                          const daysOverdue = Math.floor((Date.now() - implDate.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <tr key={idea.id} className="hover:bg-woden-primary-lighter">
                              <td className="table-cell font-mono text-xs">
                                <Link href={`/fec/idea?id=${idea.id}`} className="text-woden-primary hover:underline">
                                  {idea.code}
                                </Link>
                              </td>
                              <td className="table-cell">{idea.title}</td>
                              <td className="table-cell">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  idea.ideaType === "AHORRO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}>
                                  {idea.ideaType}
                                </span>
                              </td>
                              <td className="table-cell">{idea.company?.code || "\u2014"}</td>
                              <td className="table-cell">{idea.area.name}</td>
                              <td className="table-cell">{idea.leadEmployee.fullName}</td>
                              <td className="table-cell">{formatDate(idea.revisedImplementationDate || idea.implementationDate)}</td>
                              <td className="table-cell">
                                <span className={`font-medium ${daysOverdue > 30 ? "text-red-600" : "text-orange-600"}`}>
                                  {daysOverdue} dias
                                </span>
                              </td>
                              <td className="table-cell text-right font-medium">
                                {formatCurrency(idea.effectiveValue, idea.projectCurrency)}
                              </td>
                              <td className="table-cell text-right font-medium">
                                {formatCurrency(idea.effectiveValueUsd)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
