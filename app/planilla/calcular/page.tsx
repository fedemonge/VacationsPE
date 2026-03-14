"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import FormattedNumberInput from "@/components/FormattedNumberInput";

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
}

interface Period {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodType: string;
  status: string;
}

interface CalculatedLine {
  conceptCode: string;
  conceptName: string;
  category: string;
  amount: number;
  calcBase: number | null;
  calcRate: number | null;
  calcFormula: string | null;
}

interface CalcResult {
  lines: CalculatedLine[];
  totalIngresos: number;
  totalDescuentos: number;
  totalAportesEmpleador: number;
  netoAPagar: number;
  baseRemunerativa: number;
}

interface AdjustedLine extends CalculatedLine {
  adjustedAmount: number | null;
  adjustmentReason: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const CATEGORY_LABELS: Record<string, string> = {
  INGRESO: "Ingresos",
  DESCUENTO: "Descuentos",
  APORTE_EMPLEADOR: "Aportes del Empleador",
  INFORMATIVO: "Informativo",
};

const CATEGORY_COLORS: Record<string, string> = {
  INGRESO: "bg-green-600",
  DESCUENTO: "bg-red-600",
  APORTE_EMPLEADOR: "bg-blue-600",
  INFORMATIVO: "bg-gray-500",
};

export default function CalcularPlanillaPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <CalcularPlanillaPage />
    </Suspense>
  );
}

function CalcularPlanillaPage() {
  const { authenticated, loading: authLoading, role, hasAccess } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [adjustedLines, setAdjustedLines] = useState<AdjustedLine[]>([]);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [baseSalary, setBaseSalary] = useState(0);
  const [dailyHours, setDailyHours] = useState(8);
  const [daysWorked, setDaysWorked] = useState(30);
  const [pensionSystem, setPensionSystem] = useState<"AFP" | "ONP">("AFP");
  const [pensionProvider, setPensionProvider] = useState<string>("PRIMA");
  const [hasDependents, setHasDependents] = useState(false);
  const [has5taCatExemption, setHas5taCatExemption] = useState(false);
  const [overtimeHours25, setOvertimeHours25] = useState(0);
  const [overtimeHours35, setOvertimeHours35] = useState(0);
  const [overtimeHours100, setOvertimeHours100] = useState(0);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [totalTardinessMinutes, setTotalTardinessMinutes] = useState(0);
  const [daysAbsent, setDaysAbsent] = useState(0);
  const [annualGrossPrevious, setAnnualGrossPrevious] = useState(0);
  const [taxRetainedPrevious, setTaxRetainedPrevious] = useState(0);
  const [monthsInSemester, setMonthsInSemester] = useState(6);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, perRes] = await Promise.all([
        fetch("/api/empleados"),
        fetch("/api/planilla/periodos?status=ABIERTO"),
      ]);
      if (empRes.ok) {
        const data = await empRes.json();
        setEmployees(Array.isArray(data) ? data : data.employees || []);
      }
      if (perRes.ok) {
        const data = await perRes.json();
        setPeriods(Array.isArray(data) ? data : []);
        // Also fetch CALCULADO periods
        const perRes2 = await fetch("/api/planilla/periodos?status=CALCULADO");
        if (perRes2.ok) {
          const data2 = await perRes2.json();
          setPeriods((prev) => [...prev, ...(Array.isArray(data2) ? data2 : [])]);
        }
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated && hasAccess("/planilla/calcular")) {
      loadData();
    }
  }, [authenticated, hasAccess, loadData]);

  // Auto-load from attendance when navigated from asistencia/resumen
  useEffect(() => {
    const fromAttendance = searchParams.get("fromAttendance");
    const empId = searchParams.get("employeeId");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    if (fromAttendance === "1" && empId && year && month) {
      setEmployeeId(empId);
      setPeriodYear(parseInt(year));
      setPeriodMonth(parseInt(month));
      loadFromAttendance(empId, parseInt(year), parseInt(month));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadFromAttendance(empId?: string, year?: number, month?: number) {
    const targetEmpId = empId || employeeId;
    const targetYear = year || periodYear;
    const targetMonth = month || periodMonth;
    if (!targetEmpId) {
      setError("Seleccione un empleado primero");
      return;
    }
    setLoadingAttendance(true);
    setError("");
    try {
      // Load payroll employee data + attendance summary in parallel
      const [peRes, sumRes] = await Promise.all([
        fetch("/api/empleados"),
        fetch(`/api/planilla/asistencia/resumen?periodYear=${targetYear}&periodMonth=${targetMonth}`),
      ]);
      if (peRes.ok && sumRes.ok) {
        const peData = await peRes.json();
        const sumData = await sumRes.json();
        const payrollEmp = (peData.employees || []).find((p: { id: string }) => p.id === targetEmpId);
        const summary = sumData.find((s: { employeeId: string }) => s.employeeId === targetEmpId);

        if (payrollEmp) {
          setBaseSalary(payrollEmp.baseSalary);
          setPensionSystem(payrollEmp.pensionSystem || "AFP");
          setPensionProvider(payrollEmp.pensionProvider || "PRIMA");
          setHasDependents(payrollEmp.hasDependents);
          setHas5taCatExemption(payrollEmp.has5taCatExemption);
          if (payrollEmp.shift) {
            setDailyHours(payrollEmp.shift.effectiveHours);
          }
        }
        if (summary) {
          setDaysWorked(summary.daysWorked);
          setOvertimeHours25(summary.ot25);
          setOvertimeHours35(summary.ot35);
          setOvertimeHours100(summary.ot100);
          setTotalTardinessMinutes(summary.tardinessMin);
          setDaysAbsent(summary.daysAbsent);
          setSuccess("Datos cargados desde asistencia y maestro de empleados");
        } else {
          setSuccess(payrollEmp ? "Datos del maestro cargados (sin registros de asistencia)" : "No se encontró el empleado en el maestro de planilla");
        }
      }
    } catch {
      setError("Error al cargar datos de asistencia");
    }
    setLoadingAttendance(false);
  }

  if (authLoading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  if (!authenticated || !hasAccess("/planilla/calcular")) {
    return <div className="text-center py-12 text-gray-500">No autorizado</div>;
  }

  async function handleCalculate() {
    if (!employeeId || !baseSalary) {
      setError("Seleccione un empleado e ingrese el sueldo base");
      return;
    }
    setError("");
    setSuccess("");
    setCalculating(true);
    setResult(null);
    setAdjustedLines([]);

    try {
      const res = await fetch("/api/planilla/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          periodYear,
          periodMonth,
          baseSalary,
          dailyHours,
          daysWorked,
          pensionSystem,
          pensionProvider,
          hasDependents,
          has5taCatExemption,
          overtimeHours25,
          overtimeHours35,
          overtimeHours100,
          totalCommissions,
          totalTardinessMinutes,
          daysAbsent,
          annualGrossPreviousMonths: annualGrossPrevious,
          taxRetainedPreviousMonths: taxRetainedPrevious,
          monthsWorkedInSemester: monthsInSemester,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al calcular");
      } else {
        setResult(data);
        setAdjustedLines(
          data.lines.map((l: CalculatedLine) => ({
            ...l,
            adjustedAmount: null,
            adjustmentReason: "",
          }))
        );
      }
    } catch {
      setError("Error de conexión");
    }
    setCalculating(false);
  }

  function handleAdjustLine(index: number, newAmount: string) {
    setAdjustedLines((prev) => {
      const updated = [...prev];
      const parsed = parseFloat(newAmount);
      updated[index] = {
        ...updated[index],
        adjustedAmount: isNaN(parsed) ? null : parsed,
      };
      return updated;
    });
  }

  function handleAdjustReason(index: number, reason: string) {
    setAdjustedLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], adjustmentReason: reason };
      return updated;
    });
  }

  function getAdjustedTotals() {
    if (!result) return { totalIngresos: 0, totalDescuentos: 0, totalAportesEmpleador: 0, netoAPagar: 0 };
    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportesEmpleador = 0;
    for (const line of adjustedLines) {
      const amt = line.adjustedAmount !== null ? line.adjustedAmount : line.amount;
      if (line.category === "INGRESO") totalIngresos += amt;
      else if (line.category === "DESCUENTO") totalDescuentos += amt;
      else if (line.category === "APORTE_EMPLEADOR") totalAportesEmpleador += amt;
    }
    return {
      totalIngresos: Math.round(totalIngresos * 100) / 100,
      totalDescuentos: Math.round(totalDescuentos * 100) / 100,
      totalAportesEmpleador: Math.round(totalAportesEmpleador * 100) / 100,
      netoAPagar: Math.round((totalIngresos - totalDescuentos) * 100) / 100,
    };
  }

  const hasAdjustments = adjustedLines.some(
    (l) => l.adjustedAmount !== null && l.adjustedAmount !== l.amount
  );

  async function handleSave() {
    if (!selectedPeriodId) {
      setError("Seleccione un periodo para guardar");
      return;
    }

    // Validate adjustment reasons
    const adjWithoutReason = adjustedLines.filter(
      (l) => l.adjustedAmount !== null && l.adjustedAmount !== l.amount && !l.adjustmentReason.trim()
    );
    if (adjWithoutReason.length > 0) {
      setError("Debe ingresar una razón para cada ajuste manual");
      return;
    }

    setError("");
    setSaving(true);

    const adjustments = adjustedLines
      .filter((l) => l.adjustedAmount !== null && l.adjustedAmount !== l.amount)
      .map((l) => ({
        conceptCode: l.conceptCode,
        newAmount: l.adjustedAmount,
        reason: l.adjustmentReason,
      }));

    try {
      const res = await fetch("/api/planilla/calcular/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          periodYear,
          periodMonth,
          baseSalary,
          dailyHours,
          daysWorked,
          pensionSystem,
          pensionProvider,
          hasDependents,
          has5taCatExemption,
          overtimeHours25,
          overtimeHours35,
          overtimeHours100,
          totalCommissions,
          totalTardinessMinutes,
          daysAbsent,
          annualGrossPreviousMonths: annualGrossPrevious,
          taxRetainedPreviousMonths: taxRetainedPrevious,
          monthsWorkedInSemester: monthsInSemester,
          periodId: selectedPeriodId,
          adjustments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
      } else {
        setSuccess(
          `Cálculo guardado exitosamente${adjustments.length > 0 ? ` (${adjustments.length} ajuste(s) registrado(s))` : ""}`
        );
        loadData();
      }
    } catch {
      setError("Error de conexión");
    }
    setSaving(false);
  }

  const adjTotals = getAdjustedTotals();
  const categories = ["INGRESO", "DESCUENTO", "APORTE_EMPLEADOR", "INFORMATIVO"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calcular Planilla</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cálculo manual de planilla por empleado. Ajuste valores y guarde en un periodo.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Input Form */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Datos del Empleado</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label-field">Empleado</label>
                <div className="flex gap-2">
                  <select
                    className="input-field flex-1"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeCode} - {emp.fullName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => loadFromAttendance()}
                    disabled={!employeeId || loadingAttendance}
                    className="btn-secondary text-xs whitespace-nowrap"
                    title="Carga datos del maestro de planilla y la asistencia del periodo"
                  >
                    {loadingAttendance ? "Cargando..." : "Desde Asistencia"}
                  </button>
                </div>
              </div>
              <div>
                <label className="label-field">Año</label>
                <input
                  type="number"
                  className="input-field"
                  value={periodYear}
                  onChange={(e) => setPeriodYear(parseInt(e.target.value) || 2026)}
                />
              </div>
              <div>
                <label className="label-field">Mes</label>
                <select
                  className="input-field"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(parseInt(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Sueldo Base (S/)</label>
                <FormattedNumberInput
                  className="input-field"
                  value={baseSalary}
                  onChange={setBaseSalary}
                />
              </div>
              <div>
                <label className="label-field">Días Trabajados</label>
                <input
                  type="number"
                  className="input-field"
                  value={daysWorked}
                  onChange={(e) => setDaysWorked(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label-field">Jornada Diaria (hrs)</label>
                <input
                  type="number"
                  className="input-field"
                  value={dailyHours}
                  onChange={(e) => setDailyHours(parseFloat(e.target.value) || 8)}
                />
              </div>
              <div>
                <label className="label-field">Sistema Pensionario</label>
                <select
                  className="input-field"
                  value={pensionSystem}
                  onChange={(e) => setPensionSystem(e.target.value as "AFP" | "ONP")}
                >
                  <option value="AFP">AFP</option>
                  <option value="ONP">ONP</option>
                </select>
              </div>
              {pensionSystem === "AFP" && (
                <div>
                  <label className="label-field">Proveedor AFP</label>
                  <select
                    className="input-field"
                    value={pensionProvider}
                    onChange={(e) => setPensionProvider(e.target.value)}
                  >
                    <option value="HABITAT">Habitat</option>
                    <option value="INTEGRA">Integra</option>
                    <option value="PRIMA">Prima</option>
                    <option value="PROFUTURO">Profuturo</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hasDependents}
                    onChange={(e) => setHasDependents(e.target.checked)}
                    className="rounded-sm"
                  />
                  Tiene Dependientes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={has5taCatExemption}
                    onChange={(e) => setHas5taCatExemption(e.target.checked)}
                    className="rounded-sm"
                  />
                  Exonerado 5ta Cat.
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Variables</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field">Horas Extra 25%</label>
                <input type="number" step="0.5" className="input-field" value={overtimeHours25 || ""} onChange={(e) => setOvertimeHours25(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-field">Horas Extra 35%</label>
                <input type="number" step="0.5" className="input-field" value={overtimeHours35 || ""} onChange={(e) => setOvertimeHours35(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-field">Horas Extra 100%</label>
                <input type="number" step="0.5" className="input-field" value={overtimeHours100 || ""} onChange={(e) => setOvertimeHours100(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-field">Comisiones (S/)</label>
                <FormattedNumberInput className="input-field" value={totalCommissions} onChange={setTotalCommissions} />
              </div>
              <div>
                <label className="label-field">Min. Tardanza</label>
                <input type="number" className="input-field" value={totalTardinessMinutes || ""} onChange={(e) => setTotalTardinessMinutes(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-field">Días Ausencia</label>
                <input type="number" className="input-field" value={daysAbsent || ""} onChange={(e) => setDaysAbsent(parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">5ta Categoría - Acumulados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field">Bruto Acumulado Anterior (S/)</label>
                <FormattedNumberInput className="input-field" value={annualGrossPrevious} onChange={setAnnualGrossPrevious} />
              </div>
              <div>
                <label className="label-field">IR Retenido Anterior (S/)</label>
                <FormattedNumberInput className="input-field" value={taxRetainedPrevious} onChange={setTaxRetainedPrevious} />
              </div>
              <div>
                <label className="label-field">Meses Trabajados Semestre</label>
                <input type="number" min="1" max="6" className="input-field" value={monthsInSemester} onChange={(e) => setMonthsInSemester(parseInt(e.target.value) || 6)} />
              </div>
            </div>
          </div>

          <button
            onClick={handleCalculate}
            disabled={calculating || !employeeId || !baseSalary}
            className="btn-primary w-full"
          >
            {calculating ? "Calculando..." : "Calcular"}
          </button>
        </div>

        {/* RIGHT: Results */}
        <div className="space-y-4">
          {result && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="card text-center">
                  <p className="text-xs text-gray-500">Total Ingresos</p>
                  <p className="text-xl font-bold text-green-600">
                    S/ {(hasAdjustments ? adjTotals.totalIngresos : result.totalIngresos).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-500">Total Descuentos</p>
                  <p className="text-xl font-bold text-red-600">
                    S/ {(hasAdjustments ? adjTotals.totalDescuentos : result.totalDescuentos).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-500">Aportes Empleador</p>
                  <p className="text-xl font-bold text-blue-600">
                    S/ {(hasAdjustments ? adjTotals.totalAportesEmpleador : result.totalAportesEmpleador).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="card text-center border-2 border-woden-primary">
                  <p className="text-xs text-gray-500">Neto a Pagar</p>
                  <p className="text-xl font-bold text-woden-primary">
                    S/ {(hasAdjustments ? adjTotals.netoAPagar : result.netoAPagar).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="card">
                <p className="text-xs text-gray-500">Base Remunerativa</p>
                <p className="text-lg font-semibold text-gray-700">
                  S/ {result.baseRemunerativa.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Concept Breakdown */}
              <div className="card overflow-x-auto">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Concepto</h2>
                {hasAdjustments && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-sm text-amber-800 text-xs">
                    Las celdas en naranja tienen ajustes manuales. Cada ajuste requiere una razón y será registrado en el reporte de excepciones.
                  </div>
                )}
                <table className="w-full text-sm">
                  {categories.map((cat) => {
                    const catLines = adjustedLines.filter((l) => l.category === cat);
                    if (catLines.length === 0) return null;
                    return (
                      <tbody key={cat}>
                        <tr>
                          <td colSpan={5} className={`${CATEGORY_COLORS[cat]} text-white text-xs font-semibold px-3 py-1.5`}>
                            {CATEGORY_LABELS[cat]}
                          </td>
                        </tr>
                        {catLines.map((line) => {
                          const globalIdx = adjustedLines.indexOf(line);
                          const isAdj = line.adjustedAmount !== null && line.adjustedAmount !== line.amount;
                          return (
                            <tr
                              key={line.conceptCode}
                              className={`border-b border-gray-100 ${isAdj ? "bg-amber-50" : "hover:bg-gray-50"}`}
                            >
                              <td className="px-3 py-2 text-gray-600">{line.conceptName}</td>
                              <td className="px-3 py-2 text-right text-gray-400 text-xs">
                                {line.calcBase !== null ? `Base: ${line.calcBase.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-400 text-xs">
                                {line.calcRate !== null ? `${line.calcRate}%` : ""}
                              </td>
                              <td className="px-3 py-2 text-right w-32">
                                <input
                                  type="number"
                                  step="0.01"
                                  className={`w-full text-right text-sm border rounded-sm px-2 py-1 ${
                                    isAdj ? "border-amber-400 bg-amber-100 font-semibold" : "border-gray-200"
                                  }`}
                                  value={line.adjustedAmount !== null ? line.adjustedAmount : line.amount}
                                  onChange={(e) => handleAdjustLine(globalIdx, e.target.value)}
                                />
                              </td>
                              <td className="px-1 py-2 w-6">
                                {isAdj && (
                                  <span className="text-amber-500 text-xs" title="Ajustado">*</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Adjustment reason rows */}
                        {catLines
                          .filter((l) => l.adjustedAmount !== null && l.adjustedAmount !== l.amount)
                          .map((line) => {
                            const globalIdx = adjustedLines.indexOf(line);
                            return (
                              <tr key={`reason-${line.conceptCode}`} className="bg-amber-50">
                                <td colSpan={5} className="px-3 py-1">
                                  <input
                                    type="text"
                                    placeholder={`Razón del ajuste: ${line.conceptName}`}
                                    className="w-full text-xs border border-amber-300 rounded-sm px-2 py-1 bg-white"
                                    value={line.adjustmentReason}
                                    onChange={(e) => handleAdjustReason(globalIdx, e.target.value)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    );
                  })}
                </table>
              </div>

              {/* Save to Period */}
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Guardar en Periodo</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    className="input-field flex-1"
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                  >
                    <option value="">Seleccionar periodo...</option>
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {MONTHS[p.periodMonth - 1]} {p.periodYear} ({p.status})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSave}
                    disabled={saving || !selectedPeriodId}
                    className="btn-primary whitespace-nowrap"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </>
          )}

          {!result && !calculating && (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">&#128202;</p>
              <p>Complete los datos y presione &quot;Calcular&quot; para ver el desglose</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
