import { TatCalcOptions, SubProcessTats } from "./types";

/**
 * Calculate business days between two dates, respecting operator config.
 * Returns fractional days (based on hour differences within the day boundary).
 */
export function calculateBusinessDays(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  options: TatCalcOptions
): number | null {
  if (!startDate || !endDate) return null;
  if (endDate <= startDate) return 0;

  // Build a Set of holiday date strings for fast lookup
  const holidaySet = new Set<string>();
  if (!options.includeHolidays) {
    for (const h of options.holidays) {
      holidaySet.add(
        `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}-${String(h.getUTCDate()).padStart(2, "0")}`
      );
    }
  }

  const start = new Date(startDate.getTime());
  const end = new Date(endDate.getTime());

  // Count full calendar days between the dates
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  let businessDays = 0;
  const current = new Date(startDay.getTime());

  // Count business days for each full day
  while (current < endDay) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dayOfWeek = current.getUTCDay(); // 0=Sunday, 6=Saturday

    if (dayOfWeek === 6 && !options.includeSaturdays) continue;
    if (dayOfWeek === 0 && !options.includeSundays) continue;

    if (!options.includeHolidays) {
      const dateKey = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
      if (holidaySet.has(dateKey)) continue;
    }

    businessDays++;
  }

  // Add fractional day component based on hours
  const totalCalendarMs = end.getTime() - start.getTime();
  const totalCalendarDays = totalCalendarMs / (1000 * 60 * 60 * 24);
  if (totalCalendarDays <= 0) return 0;

  // Proportional adjustment: business days relative to total
  const fraction = businessDays > 0
    ? Math.round(businessDays * 10) / 10
    : Math.round(totalCalendarDays * 10) / 10;

  return fraction;
}

/**
 * Calculate all sub-process TATs for an order.
 */
export function calculateSubProcessTats(
  orden: {
    ingreso?: Date | null;
    envio?: Date | null;
    diagnostico?: Date | null;
    reparacion?: Date | null;
    calidad?: Date | null;
    retorno?: Date | null;
    entrega?: Date | null;
  },
  options: TatCalcOptions,
  targets: { garantia: number; woden: number; lab: number }
): SubProcessTats {
  const tatGarantiasCalc = calculateBusinessDays(orden.ingreso, orden.entrega, options);
  const tatWodenCalc = calculateBusinessDays(orden.ingreso, orden.retorno, options);
  const tatLaboratorioCalc = calculateBusinessDays(orden.envio, orden.reparacion, options);

  return {
    tatGarantiasCalc,
    tatWodenCalc,
    tatLaboratorioCalc,
    tatIngresoADiag: calculateBusinessDays(orden.ingreso, orden.diagnostico, options),
    tatDiagAReparacion: calculateBusinessDays(orden.diagnostico, orden.reparacion, options),
    tatReparacionACalidad: calculateBusinessDays(orden.reparacion, orden.calidad, options),
    tatCalidadARetorno: calculateBusinessDays(orden.calidad, orden.retorno, options),
    tatRetornoAEntrega: calculateBusinessDays(orden.retorno, orden.entrega, options),
    cumplTatGarantiaCalc: tatGarantiasCalc !== null ? tatGarantiasCalc <= targets.garantia : null,
    cumplTatWodenCalc: tatWodenCalc !== null ? tatWodenCalc <= targets.woden : null,
    cumplTatLabCalc: tatLaboratorioCalc !== null ? tatLaboratorioCalc <= targets.lab : null,
  };
}

/**
 * Calculate aging days for open orders (from ingreso to now).
 */
export function calculateAging(
  ingreso: Date | null | undefined,
  options: TatCalcOptions
): number | null {
  if (!ingreso) return null;
  return calculateBusinessDays(ingreso, new Date(), options);
}
