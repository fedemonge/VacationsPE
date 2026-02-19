import { getMonthEnd, getMonthStart } from "./dates";

interface EmployeeDates {
  hireDate: Date;
  terminationDate: Date | null;
}

export function isActiveOnDate(emp: EmployeeDates, date: Date): boolean {
  return (
    emp.hireDate <= date &&
    (emp.terminationDate === null || emp.terminationDate >= date)
  );
}

export function isActiveInMonth(
  emp: EmployeeDates,
  year: number,
  month: number
): boolean {
  const monthEnd = getMonthEnd(year, month);
  const monthStart = getMonthStart(year, month);

  if (isActiveOnDate(emp, monthEnd)) return true;

  return (
    emp.hireDate <= monthEnd &&
    (emp.terminationDate === null || emp.terminationDate >= monthStart)
  );
}
