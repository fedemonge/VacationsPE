/**
 * Core payroll calculation engine for Peru.
 * Port of payroll_api/app/services/concept_calculator.py
 */

import {
  EmployeePayrollContext,
  CalculatedLine,
  PayrollCalculationResult,
} from "./types";
import {
  AFP_RATES,
  ONP_RATE,
  ESSALUD_RATE,
  GRATIFICATION_BONUS_RATE,
  calculateMonthlyRetention,
} from "./peru-tax";

function q(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── INGRESOS ────────────────────────────────────────────────────

function calcSueldoBasico(ctx: EmployeePayrollContext): CalculatedLine {
  let amount: number;
  if (ctx.daysWorked >= 30) {
    amount = ctx.baseSalary;
  } else {
    const daily = ctx.baseSalary / 30;
    amount = q(daily * ctx.daysWorked);
  }
  return {
    conceptCode: "SUELDO_BASICO",
    conceptName: "Sueldo Básico",
    category: "INGRESO",
    amount,
    calcBase: ctx.baseSalary,
    calcRate: null,
    calcFormula: `base_salary / 30 * ${ctx.daysWorked} días`,
  };
}

function calcAsignacionFamiliar(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (!ctx.hasDependents) return null;
  const amount = q(ctx.rmvValue * 0.10);
  return {
    conceptCode: "ASIG_FAMILIAR",
    conceptName: "Asignación Familiar",
    category: "INGRESO",
    amount,
    calcBase: ctx.rmvValue,
    calcRate: 10,
    calcFormula: "RMV * 10%",
  };
}

function calcHorasExtra25(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.overtimeHours25 <= 0) return null;
  const hourly = ctx.baseSalary / 240;
  const amount = q(hourly * 1.25 * ctx.overtimeHours25);
  return {
    conceptCode: "HE_25",
    conceptName: "Horas Extra 25%",
    category: "INGRESO",
    amount,
    calcBase: q(hourly),
    calcRate: 25,
    calcFormula: `hourly(${q(hourly)}) * 1.25 * ${ctx.overtimeHours25}h`,
  };
}

function calcHorasExtra35(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.overtimeHours35 <= 0) return null;
  const hourly = ctx.baseSalary / 240;
  const amount = q(hourly * 1.35 * ctx.overtimeHours35);
  return {
    conceptCode: "HE_35",
    conceptName: "Horas Extra 35%",
    category: "INGRESO",
    amount,
    calcBase: q(hourly),
    calcRate: 35,
    calcFormula: `hourly(${q(hourly)}) * 1.35 * ${ctx.overtimeHours35}h`,
  };
}

function calcHorasExtra100(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.overtimeHours100 <= 0) return null;
  const hourly = ctx.baseSalary / 240;
  const amount = q(hourly * 2.0 * ctx.overtimeHours100);
  return {
    conceptCode: "HE_100",
    conceptName: "Horas Extra 100%",
    category: "INGRESO",
    amount,
    calcBase: q(hourly),
    calcRate: 100,
    calcFormula: `hourly(${q(hourly)}) * 2.00 * ${ctx.overtimeHours100}h`,
  };
}

function calcComisiones(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.totalCommissions <= 0) return null;
  return {
    conceptCode: "COMISION",
    conceptName: "Comisiones",
    category: "INGRESO",
    amount: q(ctx.totalCommissions),
    calcBase: null,
    calcRate: null,
    calcFormula: "sum(comisiones)",
  };
}

function calcGratificacion(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (!ctx.isGratificationMonth) return null;
  const proportion = ctx.monthsWorkedInSemester / 6;
  const amount = q(ctx.baseSalary * proportion);
  return {
    conceptCode: "GRATIFICACION",
    conceptName: "Gratificación",
    category: "INGRESO",
    amount,
    calcBase: ctx.baseSalary,
    calcRate: q(proportion * 100),
    calcFormula: `base_salary * (${ctx.monthsWorkedInSemester}/6)`,
  };
}

function calcBonifExtraordinaria(gratificationAmount: number): CalculatedLine | null {
  if (gratificationAmount <= 0) return null;
  const rate = GRATIFICATION_BONUS_RATE / 100;
  const amount = q(gratificationAmount * rate);
  return {
    conceptCode: "BONIF_EXTRA",
    conceptName: "Bonificación Extraordinaria",
    category: "INGRESO",
    amount,
    calcBase: gratificationAmount,
    calcRate: GRATIFICATION_BONUS_RATE,
    calcFormula: "gratificación * 9%",
  };
}

// ── DESCUENTOS ──────────────────────────────────────────────────

function calcDescuentoTardanzas(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.totalTardinessMinutes <= 0) return null;
  const daily = ctx.baseSalary / 30;
  const minuteRate = daily / (ctx.dailyHours * 60);
  const amount = q(minuteRate * ctx.totalTardinessMinutes);
  return {
    conceptCode: "DESC_TARDANZA",
    conceptName: "Descuento por Tardanzas",
    category: "DESCUENTO",
    amount,
    calcBase: q(daily),
    calcRate: null,
    calcFormula: `daily_rate/(${ctx.dailyHours}*60) * ${ctx.totalTardinessMinutes}min`,
  };
}

function calcDescuentoFaltas(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (ctx.daysAbsent <= 0) return null;
  const daily = ctx.baseSalary / 30;
  const amount = q(daily * ctx.daysAbsent);
  return {
    conceptCode: "DESC_FALTAS",
    conceptName: "Descuento por Faltas",
    category: "DESCUENTO",
    amount,
    calcBase: q(daily),
    calcRate: null,
    calcFormula: `daily_rate * ${ctx.daysAbsent} días`,
  };
}

function calcONP(ctx: EmployeePayrollContext, baseRemunerativa: number): CalculatedLine | null {
  if (ctx.pensionSystem !== "ONP") return null;
  const amount = q(baseRemunerativa * ONP_RATE / 100);
  return {
    conceptCode: "ONP",
    conceptName: "ONP",
    category: "DESCUENTO",
    amount,
    calcBase: q(baseRemunerativa),
    calcRate: ONP_RATE,
    calcFormula: "base_remunerativa * 13%",
  };
}

function calcAFP(ctx: EmployeePayrollContext, baseRemunerativa: number): CalculatedLine[] {
  if (ctx.pensionSystem !== "AFP") return [];

  const provider = ctx.pensionProvider || "PRIMA";
  const rates = AFP_RATES[provider] || AFP_RATES["PRIMA"];
  const fondoRate = ctx.afpFondoRate ?? rates.fondo;
  const seguroRate = ctx.afpSeguroRate ?? rates.seguro;
  const comisionRate = ctx.afpComisionRate ?? rates.comisionFlujo;

  return [
    {
      conceptCode: "AFP_FONDO",
      conceptName: `AFP ${provider} - Fondo`,
      category: "DESCUENTO",
      amount: q(baseRemunerativa * fondoRate / 100),
      calcBase: q(baseRemunerativa),
      calcRate: fondoRate,
      calcFormula: `base_remunerativa * ${fondoRate}%`,
    },
    {
      conceptCode: "AFP_SEGURO",
      conceptName: `AFP ${provider} - Seguro`,
      category: "DESCUENTO",
      amount: q(baseRemunerativa * seguroRate / 100),
      calcBase: q(baseRemunerativa),
      calcRate: seguroRate,
      calcFormula: `base_remunerativa * ${seguroRate}%`,
    },
    {
      conceptCode: "AFP_COMISION",
      conceptName: `AFP ${provider} - Comisión`,
      category: "DESCUENTO",
      amount: q(baseRemunerativa * comisionRate / 100),
      calcBase: q(baseRemunerativa),
      calcRate: comisionRate,
      calcFormula: `base_remunerativa * ${comisionRate}%`,
    },
  ];
}

function calc5taCategoria(ctx: EmployeePayrollContext, monthlyGross: number): CalculatedLine | null {
  if (ctx.has5taCatExemption) return null;

  const remainingMonths = 12 - ctx.periodMonth + 1;
  let projectedAnnual = ctx.annualGrossPreviousMonths + monthlyGross * remainingMonths;
  projectedAnnual += ctx.baseSalary * 2; // 2 gratificaciones

  const retention = calculateMonthlyRetention(
    ctx.periodMonth,
    projectedAnnual,
    ctx.uitValue,
    ctx.taxRetainedPreviousMonths
  );

  if (retention <= 0) return null;

  return {
    conceptCode: "RENTA_5TA",
    conceptName: "Impuesto Renta 5ta Categoría",
    category: "DESCUENTO",
    amount: retention,
    calcBase: q(projectedAnnual),
    calcRate: null,
    calcFormula: `proyección anual(${q(projectedAnnual)}) - 7UIT, escala progresiva, mes ${ctx.periodMonth}`,
  };
}

// ── APORTES EMPLEADOR ───────────────────────────────────────────

function calcEsSalud(baseRemunerativa: number): CalculatedLine {
  const amount = q(baseRemunerativa * ESSALUD_RATE / 100);
  return {
    conceptCode: "ESSALUD",
    conceptName: "EsSalud",
    category: "APORTE_EMPLEADOR",
    amount,
    calcBase: q(baseRemunerativa),
    calcRate: ESSALUD_RATE,
    calcFormula: "base_remunerativa * 9%",
  };
}

function calcProvVacaciones(
  ctx: EmployeePayrollContext,
  asigFamiliarAmount: number
): CalculatedLine {
  const computable = ctx.baseSalary + asigFamiliarAmount;
  const amount = q(computable / 12);
  return {
    conceptCode: "PROV_VACACIONES",
    conceptName: "Provisión Vacaciones",
    category: "APORTE_EMPLEADOR",
    amount,
    calcBase: q(computable),
    calcRate: null,
    calcFormula: "(salary + asig_familiar) / 12",
  };
}

function calcProvCTS(ctx: EmployeePayrollContext): CalculatedLine {
  const gratSexto = ctx.baseSalary / 6;
  const computable = ctx.baseSalary + gratSexto;
  const amount = q(computable / 12);
  return {
    conceptCode: "PROV_CTS",
    conceptName: "Provisión CTS",
    category: "APORTE_EMPLEADOR",
    amount,
    calcBase: q(computable),
    calcRate: null,
    calcFormula: "(salary + salary/6) / 12",
  };
}

function calcProvGratificacion(ctx: EmployeePayrollContext): CalculatedLine {
  const amount = q(ctx.baseSalary / 6);
  return {
    conceptCode: "PROV_GRATIFICACION",
    conceptName: "Provisión Gratificación",
    category: "APORTE_EMPLEADOR",
    amount,
    calcBase: ctx.baseSalary,
    calcRate: null,
    calcFormula: "salary / 6",
  };
}

// ── INFORMATIVO ─────────────────────────────────────────────────

function calcCTS(ctx: EmployeePayrollContext): CalculatedLine | null {
  if (!ctx.isCtsMonth) return null;
  const gratSexto = ctx.baseSalary / 6;
  const computable = ctx.baseSalary + gratSexto;
  const monthly = computable / 12;
  const amount = q(monthly * ctx.monthsWorkedInSemester);
  return {
    conceptCode: "CTS",
    conceptName: "CTS - Depósito Semestral",
    category: "INFORMATIVO",
    amount,
    calcBase: q(computable),
    calcRate: null,
    calcFormula: `(salary + salary/6) / 12 * ${ctx.monthsWorkedInSemester} meses`,
  };
}

// ── ORCHESTRATOR ────────────────────────────────────────────────

export function calculateAll(ctx: EmployeePayrollContext): PayrollCalculationResult {
  const lines: CalculatedLine[] = [];

  // === INGRESOS ===
  const sueldo = calcSueldoBasico(ctx);
  lines.push(sueldo);

  const asigFam = calcAsignacionFamiliar(ctx);
  if (asigFam) lines.push(asigFam);

  const he25 = calcHorasExtra25(ctx);
  if (he25) lines.push(he25);

  const he35 = calcHorasExtra35(ctx);
  if (he35) lines.push(he35);

  const he100 = calcHorasExtra100(ctx);
  if (he100) lines.push(he100);

  const comisiones = calcComisiones(ctx);
  if (comisiones) lines.push(comisiones);

  const grat = calcGratificacion(ctx);
  if (grat) {
    lines.push(grat);
    const bonif = calcBonifExtraordinaria(grat.amount);
    if (bonif) lines.push(bonif);
  }

  // === BASE REMUNERATIVA ===
  let baseRemunerativa = sueldo.amount;
  if (asigFam) baseRemunerativa += asigFam.amount;
  if (he25) baseRemunerativa += he25.amount;
  if (he35) baseRemunerativa += he35.amount;
  if (he100) baseRemunerativa += he100.amount;
  if (comisiones) baseRemunerativa += comisiones.amount;

  let monthlyGross = baseRemunerativa;
  if (grat) monthlyGross += grat.amount;

  // === DESCUENTOS ===
  const tardanzas = calcDescuentoTardanzas(ctx);
  if (tardanzas) lines.push(tardanzas);

  const faltas = calcDescuentoFaltas(ctx);
  if (faltas) lines.push(faltas);

  const onp = calcONP(ctx, baseRemunerativa);
  if (onp) lines.push(onp);

  const afpLines = calcAFP(ctx, baseRemunerativa);
  lines.push(...afpLines);

  const renta = calc5taCategoria(ctx, monthlyGross);
  if (renta) lines.push(renta);

  // === APORTES EMPLEADOR ===
  const essalud = calcEsSalud(baseRemunerativa);
  lines.push(essalud);

  // === PROVISIONES ===
  const provVac = calcProvVacaciones(ctx, asigFam ? asigFam.amount : 0);
  lines.push(provVac);

  const provCTS = calcProvCTS(ctx);
  lines.push(provCTS);

  const provGrat = calcProvGratificacion(ctx);
  lines.push(provGrat);

  // === INFORMATIVO ===
  const cts = calcCTS(ctx);
  if (cts) lines.push(cts);

  // === TOTALS ===
  const totalIngresos = q(lines.filter(l => l.category === "INGRESO").reduce((s, l) => s + l.amount, 0));
  const totalDescuentos = q(lines.filter(l => l.category === "DESCUENTO").reduce((s, l) => s + l.amount, 0));
  const totalAportesEmpleador = q(lines.filter(l => l.category === "APORTE_EMPLEADOR").reduce((s, l) => s + l.amount, 0));
  const netoAPagar = q(totalIngresos - totalDescuentos);

  return {
    lines,
    totalIngresos,
    totalDescuentos,
    totalAportesEmpleador,
    netoAPagar,
    baseRemunerativa: q(baseRemunerativa),
  };
}
