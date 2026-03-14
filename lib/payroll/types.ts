export type PayrollCategory = "INGRESO" | "DESCUENTO" | "APORTE_EMPLEADOR" | "INFORMATIVO";
export type PeriodStatus = "ABIERTO" | "CALCULADO" | "CERRADO" | "ANULADO";
export type PeriodType = "MENSUAL" | "GRATIFICACION" | "CTS" | "LIQUIDACION";
export type PensionSystem = "AFP" | "ONP";
export type AFPProvider = "HABITAT" | "INTEGRA" | "PRIMA" | "PROFUTURO";

export interface EmployeePayrollContext {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  baseSalary: number;
  dailyHours: number;
  pensionSystem: PensionSystem;
  pensionProvider: AFPProvider;
  has5taCatExemption: boolean;
  hasDependents: boolean;
  periodYear: number;
  periodMonth: number;
  daysWorked: number;
  overtimeHours25: number;
  overtimeHours35: number;
  overtimeHours100: number;
  totalCommissions: number;
  totalTardinessMinutes: number;
  daysAbsent: number;
  uitValue: number;
  rmvValue: number;
  afpFondoRate: number | null;
  afpSeguroRate: number | null;
  afpComisionRate: number | null;
  annualGrossPreviousMonths: number;
  taxRetainedPreviousMonths: number;
  monthsWorkedInSemester: number;
  isGratificationMonth: boolean;
  isCtsMonth: boolean;
}

export interface CalculatedLine {
  conceptCode: string;
  conceptName: string;
  category: PayrollCategory;
  amount: number;
  calcBase: number | null;
  calcRate: number | null;
  calcFormula: string | null;
}

export interface PayrollCalculationResult {
  lines: CalculatedLine[];
  totalIngresos: number;
  totalDescuentos: number;
  totalAportesEmpleador: number;
  netoAPagar: number;
  baseRemunerativa: number;
}

export interface PayrollInputForm {
  employeeId: string;
  periodYear: number;
  periodMonth: number;
  baseSalary: number;
  dailyHours: number;
  daysWorked: number;
  pensionSystem: PensionSystem;
  pensionProvider: AFPProvider;
  hasDependents: boolean;
  has5taCatExemption: boolean;
  overtimeHours25: number;
  overtimeHours35: number;
  overtimeHours100: number;
  totalCommissions: number;
  totalTardinessMinutes: number;
  daysAbsent: number;
  annualGrossPreviousMonths: number;
  taxRetainedPreviousMonths: number;
  monthsWorkedInSemester: number;
}

export interface PayrollAdjustment {
  conceptCode: string;
  newAmount: number;
  reason: string;
}
