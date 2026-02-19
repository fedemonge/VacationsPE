"use client";

import { useState, useEffect } from "react";

interface ApprovalTimeReport {
  approverName: string;
  approverEmail: string;
  level: number;
  avgDays: number;
  totalApprovals: number;
}

interface AgingReport {
  accrualYear: number;
  totalEmployees: number;
  totalAccrued: number;
  totalConsumed: number;
  totalRemaining: number;
}

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState<"aprobaciones" | "aging">("aprobaciones");
  const [approvalReport, setApprovalReport] = useState<ApprovalTimeReport[]>([]);
  const [agingReport, setAgingReport] = useState<AgingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCostCenter, setFilterCostCenter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = filterCostCenter ? `?costCenter=${filterCostCenter}` : "";
    Promise.all([
      fetch(`/api/reportes?type=aprobaciones${params ? "&" + params.slice(1) : ""}`).then((r) => r.json()),
      fetch(`/api/reportes?type=aging${params ? "&" + params.slice(1) : ""}`).then((r) => r.json()),
    ])
      .then(([approvalData, agingData]) => {
        setApprovalReport(approvalData.report || []);
        setAgingReport(agingData.report || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCostCenter]);

  const tabs = [
    { key: "aprobaciones" as const, label: "Tiempos de Aprobación" },
    { key: "aging" as const, label: "Antigüedad de Vacaciones" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Reportes</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Reportes de tiempos de aprobación y antigüedad de saldos de vacaciones.
      </p>

      {/* Cost Center Filter */}
      <div className="mb-6">
        <label className="label-field">Filtrar por Centro de Costos</label>
        <input
          type="text"
          className="input-field max-w-xs"
          value={filterCostCenter}
          onChange={(e) => setFilterCostCenter(e.target.value)}
          placeholder="Dejar vacío para todos..."
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-woden-primary text-woden-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center text-gray-400">Cargando...</div>
      ) : activeTab === "aprobaciones" ? (
        /* Approval Time Report */
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Aprobador</th>
                <th className="table-header">Nivel</th>
                <th className="table-header">Total Aprobaciones</th>
                <th className="table-header">Tiempo Promedio (días)</th>
              </tr>
            </thead>
            <tbody>
              {approvalReport.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-cell text-center text-gray-400">
                    No hay datos de aprobaciones
                  </td>
                </tr>
              ) : (
                approvalReport.map((row, i) => (
                  <tr key={i} className="hover:bg-woden-primary-lighter">
                    <td className="table-cell">
                      <p className="font-medium">{row.approverName}</p>
                      <p className="text-xs text-gray-400">
                        {row.approverEmail}
                      </p>
                    </td>
                    <td className="table-cell text-center">
                      Nivel {row.level}
                    </td>
                    <td className="table-cell text-center">
                      {row.totalApprovals}
                    </td>
                    <td className="table-cell text-center">
                      <span
                        className={`font-medium ${
                          row.avgDays > 3
                            ? "text-red-600"
                            : row.avgDays > 1
                              ? "text-yellow-600"
                              : "text-green-600"
                        }`}
                      >
                        {row.avgDays.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Aging Report */
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Periodo</th>
                <th className="table-header">Empleados</th>
                <th className="table-header">Total Devengado</th>
                <th className="table-header">Total Consumido</th>
                <th className="table-header">Saldo Restante</th>
              </tr>
            </thead>
            <tbody>
              {agingReport.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center text-gray-400">
                    No hay datos de antigüedad
                  </td>
                </tr>
              ) : (
                agingReport.map((row) => {
                  const currentYear = new Date().getFullYear();
                  const age = currentYear - row.accrualYear;
                  const colorClass =
                    age >= 2
                      ? "text-red-600"
                      : age === 1
                        ? "text-yellow-600"
                        : "text-green-600";
                  return (
                    <tr key={row.accrualYear} className="hover:bg-woden-primary-lighter">
                      <td className={`table-cell font-medium ${colorClass}`}>
                        {row.accrualYear}
                      </td>
                      <td className="table-cell text-center">
                        {row.totalEmployees}
                      </td>
                      <td className="table-cell text-right">
                        {row.totalAccrued.toFixed(1)}
                      </td>
                      <td className="table-cell text-right">
                        {row.totalConsumed.toFixed(1)}
                      </td>
                      <td className={`table-cell text-right font-medium ${colorClass}`}>
                        {row.totalRemaining.toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
