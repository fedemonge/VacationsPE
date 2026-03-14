/**
 * Peruvian tax calculations — Régimen General Privado.
 * 5ta Categoría income tax + AFP/ONP rates.
 * Reference: Ley del Impuesto a la Renta, Art. 53 (TUO DS 179-2004-EF)
 */

function q(value: number): number {
  return Math.round(value * 100) / 100;
}

// Progressive 5ta categoría brackets (in UITs)
// Hasta 5 UIT: 8%, 5-20: 14%, 20-35: 17%, 35-45: 20%, >45: 30%
const TAX_BRACKETS_UIT: Array<[number | null, number]> = [
  [5, 0.08],
  [15, 0.14],
  [15, 0.17],
  [10, 0.20],
  [null, 0.30],
];

export function calculateAnnualTax(annualGross: number, uitValue: number): number {
  const deduction = uitValue * 7;
  const taxableIncome = Math.max(0, annualGross - deduction);
  if (taxableIncome <= 0) return 0;

  let totalTax = 0;
  let remaining = taxableIncome;

  for (const [bracketUits, rate] of TAX_BRACKETS_UIT) {
    if (remaining <= 0) break;
    const bracketAmount = bracketUits !== null ? bracketUits * uitValue : remaining;
    const taxableInBracket = Math.min(remaining, bracketAmount);
    totalTax += q(taxableInBracket * rate);
    remaining -= taxableInBracket;
  }

  return q(totalTax);
}

export function calculateMonthlyRetention(
  currentMonth: number,
  annualGrossProjected: number,
  uitValue: number,
  taxAlreadyRetained: number
): number {
  const annualTax = calculateAnnualTax(annualGrossProjected, uitValue);
  const remainingTax = Math.max(0, annualTax - taxAlreadyRetained);

  if (currentMonth === 12) return q(remainingTax);

  const remainingMonths = 12 - currentMonth + 1;
  if (remainingMonths <= 0) return q(remainingTax);

  return q(remainingTax / remainingMonths);
}

// AFP rates by provider
export const AFP_RATES: Record<string, { fondo: number; seguro: number; comisionFlujo: number }> = {
  HABITAT:   { fondo: 10.00, seguro: 1.36, comisionFlujo: 1.35 },
  INTEGRA:   { fondo: 10.00, seguro: 1.36, comisionFlujo: 1.55 },
  PRIMA:     { fondo: 10.00, seguro: 1.36, comisionFlujo: 1.55 },
  PROFUTURO: { fondo: 10.00, seguro: 1.36, comisionFlujo: 1.69 },
};

export const ONP_RATE = 13.00;
export const ESSALUD_RATE = 9.00;
export const GRATIFICATION_BONUS_RATE = 9.00;

export const DEFAULT_UIT: Record<number, number> = { 2024: 5150, 2025: 5350, 2026: 5550 };
export const DEFAULT_RMV = 1025;
