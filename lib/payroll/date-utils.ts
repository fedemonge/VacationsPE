/**
 * Date utilities for payroll calculations.
 */

export function isGratificationMonth(month: number): boolean {
  return month === 7 || month === 12;
}

export function isCtsMonth(month: number): boolean {
  return month === 5 || month === 11;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getPeriodDates(year: number, month: number): { start: Date; end: Date } {
  const lastDay = daysInMonth(year, month);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month - 1, lastDay),
  };
}

export function getGratificationSemester(month: number): [number, number] {
  if (month === 7) return [1, 6];
  if (month === 12) return [7, 12];
  throw new Error(`Month ${month} is not a gratification month`);
}

export function getCtsSemester(month: number): [number, number] {
  if (month === 5) return [11, 4];
  if (month === 11) return [5, 10];
  throw new Error(`Month ${month} is not a CTS deposit month`);
}

export function monthLabel(year: number, month: number): string {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${months[month - 1]} ${year}`;
}
