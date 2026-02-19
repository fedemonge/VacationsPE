import {
  addDays,
  differenceInCalendarDays,
  isWeekend,
  lastDayOfMonth,
  startOfMonth,
  format,
} from "date-fns";
import { es } from "date-fns/locale";

export function getMinVacationStartDate(): Date {
  return addDays(new Date(), 30);
}

export function calculateVacationDays(dateFrom: Date, dateTo: Date): number {
  return differenceInCalendarDays(dateTo, dateFrom) + 1;
}

export function addWorkingDays(date: Date, days: number): Date {
  let current = date;
  let added = 0;
  while (added < days) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      added++;
    }
  }
  return current;
}

export function workingDaysBetween(start: Date, end: Date): number {
  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
}

export function getMonthEnd(year: number, month: number): Date {
  return lastDayOfMonth(new Date(year, month - 1));
}

export function getMonthStart(year: number, month: number): Date {
  return startOfMonth(new Date(year, month - 1));
}

export function formatDateES(date: Date): string {
  return format(date, "dd/MM/yyyy", { locale: es });
}

export function formatDateLongES(date: Date): string {
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function isDateInRange(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return date >= rangeStart && date <= rangeEnd;
}

export function daysUntilAutoCancel(dateFrom: Date): number {
  const cancelDate = addDays(dateFrom, -7);
  return differenceInCalendarDays(cancelDate, new Date());
}
