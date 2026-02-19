"use client";

import { useState, useEffect } from "react";

interface Accrual {
  accrualYear: number;
  totalDaysAccrued: number;
  totalDaysConsumed: number;
  remainingBalance: number;
  monthsAccrued: number;
}

interface EmployeeBalance {
  id: string;
  employeeCode: string;
  fullName: string;
  costCenter: string;
  accruals: Accrual[];
  totalAvailable: number;
}

export default function SaldosPage() {
  const [balances, setBalances] = useState<EmployeeBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCostCenter, setFilterCostCenter] = useState("");
  const [costCenters, setCostCenters] = useState<string[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/saldos")
      .then((r) => r.json())
      .then((data) => {
        setBalances(data.balances || []);
        const ccs = [
          ...new Set((data.balances || []).map((b: EmployeeBalance) => b.costCenter)),
        ] as string[];
        setCostCenters(ccs.sort());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterCostCenter
    ? balances.filter((b) => b.costCenter === filterCostCenter)
    : balances;

  function getAgingColor(year: number): string {
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age >= 2) return "text-red-600 font-bold";
    if (age === 1) return "text-yellow-600";
    return "text-green-600";
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Saldos de Vacaciones
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Control de saldo desglosado por periodo de devengamiento. El consumo
        sigue lógica FIFO (primero en entrar, primero en salir).
      </p>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <span className="text-sm text-gray-500">Centro de Costos:</span>
        <button
          className={`px-3 py-1 text-sm rounded-sm border ${
            !filterCostCenter
              ? "bg-woden-primary text-white border-woden-primary"
              : "border-gray-300 text-gray-600 hover:border-woden-primary"
          }`}
          onClick={() => setFilterCostCenter("")}
        >
          Todos
        </button>
        {costCenters.map((cc) => (
          <button
            key={cc}
            className={`px-3 py-1 text-sm rounded-sm border ${
              filterCostCenter === cc
                ? "bg-woden-primary text-white border-woden-primary"
                : "border-gray-300 text-gray-600 hover:border-woden-primary"
            }`}
            onClick={() => setFilterCostCenter(cc)}
          >
            {cc}
          </button>
        ))}
      </div>

      {/* Balances Table */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center text-gray-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="card text-center text-gray-400">
            No hay datos de saldos
          </div>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id} className="card p-0">
              {/* Employee Header */}
              <button
                className="w-full flex justify-between items-center p-4 hover:bg-woden-primary-lighter transition-colors text-left"
                onClick={() =>
                  setExpandedEmployee(
                    expandedEmployee === emp.id ? null : emp.id
                  )
                }
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {emp.fullName}{" "}
                    <span className="text-gray-400 text-xs">
                      ({emp.employeeCode})
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">{emp.costCenter}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-woden-primary">
                    {emp.totalAvailable.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-400">días disponibles</p>
                </div>
              </button>

              {/* Expanded Accrual Details */}
              {expandedEmployee === emp.id && (
                <div className="border-t border-gray-100 p-4">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 pb-2">
                          Periodo
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Meses
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Devengado
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Consumido
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 pb-2">
                          Saldo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.accruals.map((acc) => (
                        <tr key={acc.accrualYear} className="border-t border-gray-50">
                          <td className={`py-2 text-sm ${getAgingColor(acc.accrualYear)}`}>
                            {acc.accrualYear}
                          </td>
                          <td className="py-2 text-sm text-right text-gray-500">
                            {acc.monthsAccrued}/12
                          </td>
                          <td className="py-2 text-sm text-right">
                            {acc.totalDaysAccrued.toFixed(1)}
                          </td>
                          <td className="py-2 text-sm text-right text-gray-500">
                            {acc.totalDaysConsumed.toFixed(1)}
                          </td>
                          <td
                            className={`py-2 text-sm text-right font-medium ${getAgingColor(acc.accrualYear)}`}
                          >
                            {acc.remainingBalance.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Aging Legend */}
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-red-600">● +2 años (crítico)</span>
                    <span className="text-yellow-600">● 1 año (atención)</span>
                    <span className="text-green-600">● Año actual</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
