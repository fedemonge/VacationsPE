"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAY_NAMES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

interface ProductionPlan {
  equipmentId: string;
  equipment: { code: string; name: string };
  subProcess: { id: string; name: string };
  shift: { id: string; name: string } | null;
  month: number;
  year: number;
  unitsToProcess: number;
  laborHoursRequired: number;
  headcountRequired: number;
  isSpecialist: boolean;
}

interface ShiftConfig {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  costMultiplier: number;
  isActive?: boolean;
}

interface CalendarDay {
  date: Date;
  day: number;
  isWorkingDay: boolean;
  shifts: {
    shift: ShiftConfig;
    equipment: { code: string; name: string; units: number }[];
    subProcesses: { name: string; headcount: number; isSpecialist: boolean }[];
    totalHeadcount: number;
  }[];
}

export default function CalendarioPage() {
  const { authenticated } = useAuth();
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<any>(null);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [subProcesses, setSubProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(0);

  // Fetch run data + shifts + sub-processes
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [runRes, shiftsRes, calRes, procRes] = await Promise.all([
        fetch(`/api/remanufactura/mrp/run/${runId}`),
        fetch("/api/remanufactura/mrp/admin/shifts"),
        fetch("/api/remanufactura/mrp/admin/calendar"),
        fetch("/api/remanufactura/mrp/master-data/processes"),
      ]);
      if (runRes.ok) setRun(await runRes.json());
      if (shiftsRes.ok) {
        const s = await shiftsRes.json();
        setShifts(Array.isArray(s) ? s : s.shifts || []);
      }
      if (calRes.ok) setCalendar(await calRes.json());
      if (procRes.ok) setSubProcesses(await procRes.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [runId]);

  useEffect(() => {
    if (authenticated && runId) fetchData();
  }, [authenticated, runId, fetchData]);

  // Build list of months in the run
  const months = useMemo(() => {
    if (!run) return [];
    const result: { month: number; year: number }[] = [];
    let m = run.startMonth, y = run.startYear;
    for (let i = 0; i < run.horizonMonths; i++) {
      result.push({ month: m, year: y });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  }, [run]);

  // Get working days for a month
  const getWorkingDays = (month: number, year: number): number => {
    const entry = calendar.find((c: any) => c.month === month && c.year === year);
    return entry?.workingDays ?? 22;
  };

  // Build calendar days for selected month
  // Build sub-process capacity lookup (stationCount, personnelPerStation, capacityPerHour)
  const subProcCapacity = useMemo(() => {
    const map = new Map<string, { stationCount: number; personnelPerStation: number; capacityPerHour: number }>();
    for (const sp of subProcesses) {
      map.set(sp.name, {
        stationCount: sp.stationCount ?? 1,
        personnelPerStation: sp.personnelPerStation ?? 1,
        capacityPerHour: sp.capacityPerHour ?? 1,
      });
    }
    return map;
  }, [subProcesses]);

  const calendarDays = useMemo((): CalendarDay[] => {
    if (!run || months.length === 0 || shifts.length === 0) return [];
    const period = months[selectedMonth];
    if (!period) return [];

    const { month, year } = period;
    const workingDays = getWorkingDays(month, year);
    const daysInMonth = new Date(year, month, 0).getDate();
    const activeShifts = shifts.filter((s) => s.isActive !== false);

    // Get production plans for this month
    const monthPlans: ProductionPlan[] = (run.productionPlans || []).filter(
      (pp: any) => pp.month === month && pp.year === year
    );

    // Calculate daily units per equipment
    const dailyByEquip: Record<string, number> = {};
    const equipNames: Record<string, { code: string; name: string }> = {};
    for (const pp of monthPlans) {
      const key = pp.equipment.code;
      if (!dailyByEquip[key]) dailyByEquip[key] = 0;
      dailyByEquip[key] = Math.ceil(pp.unitsToProcess / workingDays);
      equipNames[key] = pp.equipment;
    }

    // Aggregate sub-process headcount across equipment
    const subProcAgg = new Map<string, { name: string; totalHC: number; isSpecialist: boolean }>();
    for (const pp of monthPlans) {
      const existing = subProcAgg.get(pp.subProcess.name);
      if (existing) {
        existing.totalHC += pp.headcountRequired;
      } else {
        subProcAgg.set(pp.subProcess.name, {
          name: pp.subProcess.name,
          totalHC: pp.headcountRequired,
          isSpecialist: pp.isSpecialist,
        });
      }
    }

    // Calculate shift hours
    const shiftHours = (s: ShiftConfig) => {
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      let h = eh + em / 60 - (sh + sm / 60);
      if (h <= 0) h += 24;
      return h;
    };

    // For each sub-process, calculate capacity per shift and distribute headcount
    const subProcByShift = new Map<string, { name: string; headcount: number; isSpecialist: boolean; stations: number; maxCapacity: number }[]>();
    for (const [spName, spData] of Array.from(subProcAgg)) {
      const cap = subProcCapacity.get(spName);
      const stations = cap?.stationCount ?? 1;
      const persPerStation = cap?.personnelPerStation ?? 1;
      const capPerHour = cap?.capacityPerHour ?? 1;

      let remainingHC = Math.ceil(spData.totalHC);
      const shiftAlloc: { name: string; headcount: number; isSpecialist: boolean; stations: number; maxCapacity: number }[] = [];

      for (const shift of activeShifts) {
        const hours = shiftHours(shift);
        // Max headcount this shift can support = stations × personnel per station
        const maxHC = stations * persPerStation;
        // Max units this shift can produce daily = stations × capPerHour × hours
        const maxCapacity = Math.floor(stations * capPerHour * hours);
        const allocated = Math.min(remainingHC, maxHC);
        shiftAlloc.push({
          name: spData.name,
          headcount: allocated,
          isSpecialist: spData.isSpecialist,
          stations,
          maxCapacity,
        });
        remainingHC -= allocated;
        if (remainingHC <= 0) break;
      }
      // Fill remaining shifts with 0
      while (shiftAlloc.length < activeShifts.length) {
        shiftAlloc.push({ name: spData.name, headcount: 0, isSpecialist: spData.isSpecialist, stations: 0, maxCapacity: 0 });
      }
      subProcByShift.set(spName, shiftAlloc);
    }

    // Build days
    const days: CalendarDay[] = [];
    let workingDayCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dow = date.getDay();
      const isWorkingDay = dow >= 1 && dow <= 5 && workingDayCount < workingDays;
      if (isWorkingDay) workingDayCount++;

      const dayShifts = isWorkingDay ? activeShifts.map((shift, shiftIdx) => {
        // Equipment: show on first shift only (total daily)
        const equipList = shiftIdx === 0
          ? Object.entries(dailyByEquip).map(([code, units]) => ({ code, name: equipNames[code]?.name || code, units }))
          : [];

        // Sub-processes: distributed across shifts by capacity
        const subProcs: { name: string; headcount: number; isSpecialist: boolean }[] = [];
        for (const [, alloc] of Array.from(subProcByShift)) {
          if (alloc[shiftIdx] && alloc[shiftIdx].headcount > 0) {
            subProcs.push({
              name: alloc[shiftIdx].name,
              headcount: alloc[shiftIdx].headcount,
              isSpecialist: alloc[shiftIdx].isSpecialist,
            });
          }
        }

        return {
          shift,
          equipment: equipList,
          subProcesses: subProcs,
          totalHeadcount: subProcs.reduce((sum, sp) => sum + sp.headcount, 0),
        };
      }) : [];

      days.push({ date, day: d, isWorkingDay, shifts: dayShifts });
    }

    return days;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, months, selectedMonth, shifts, calendar, subProcCapacity]);

  if (!authenticated) return <div className="p-8 text-center text-gray-500">Inicia sesión.</div>;
  if (loading) return <div className="max-w-7xl mx-auto px-4 py-8"><div className="animate-pulse h-96 bg-gray-100 rounded" /></div>;
  if (!run) return <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">Corrida no encontrada.</div>;

  const period = months[selectedMonth];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href={`/remanufactura/mrp/corridas/${runId}`} className="text-xs text-gray-400 hover:text-woden-primary">
            ← Volver a Corrida
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Calendario de Producción</h1>
          <p className="text-sm text-gray-500">{run.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMonth(Math.max(0, selectedMonth - 1))}
            disabled={selectedMonth === 0}
            className="px-3 py-1.5 text-sm border rounded-sm disabled:opacity-30 hover:bg-gray-50"
          >
            ◀
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">
            {period ? `${MONTH_NAMES[period.month - 1]} ${period.year}` : ""}
          </span>
          <button
            onClick={() => setSelectedMonth(Math.min(months.length - 1, selectedMonth + 1))}
            disabled={selectedMonth >= months.length - 1}
            className="px-3 py-1.5 text-sm border rounded-sm disabled:opacity-30 hover:bg-gray-50"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-xs font-semibold text-gray-500 text-center py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month start */}
        {calendarDays.length > 0 && Array.from({ length: calendarDays[0].date.getDay() }, (_, i) => (
          <div key={`empty-${i}`} className="min-h-[120px]" />
        ))}

        {calendarDays.map((day) => (
          <div
            key={day.day}
            className={`min-h-[120px] border rounded-sm p-1 text-xs ${
              day.isWorkingDay
                ? "bg-white border-gray-200"
                : "bg-gray-50 border-gray-100"
            }`}
          >
            <div className={`font-semibold mb-1 ${day.isWorkingDay ? "text-gray-700" : "text-gray-400"}`}>
              {day.day}
            </div>

            {day.isWorkingDay && day.shifts.map((shiftData, idx) => (
              <div key={idx} className={`mb-0.5 rounded-sm p-1 ${
                idx === 0 ? "bg-orange-50 border border-orange-200" :
                idx === 1 ? "bg-blue-50 border border-blue-200" :
                "bg-purple-50 border border-purple-200"
              }`}>
                <div className="font-medium text-[9px] text-gray-600 mb-0.5">{shiftData.shift.name}</div>
                {shiftData.equipment.length > 0 ? (
                  <>
                    {shiftData.equipment.map((eq) => (
                      <div key={eq.code} className="text-[9px] text-gray-700">
                        {eq.code}: <span className="font-semibold">{eq.units}</span> ud
                      </div>
                    ))}
                    <div className="border-t border-gray-200 mt-0.5 pt-0.5">
                      {shiftData.subProcesses.map((sp) => (
                        <div key={sp.name} className="text-[9px] text-gray-500 flex justify-between">
                          <span>{sp.name.substring(0, 8)}{sp.name.length > 8 ? "." : ""}</span>
                          <span className={`font-medium ${sp.isSpecialist ? "text-orange-600" : ""}`}>
                            {sp.headcount}p
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] font-semibold text-gray-700 mt-0.5">
                      HC: {shiftData.totalHeadcount}
                    </div>
                  </>
                ) : (
                  <div className="text-[8px] text-gray-300">—</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-50 border border-orange-200 rounded-sm" />
          {shifts[0]?.name || "Turno 1"}
        </div>
        {shifts[1] && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-50 border border-blue-200 rounded-sm" />
            {shifts[1].name}
          </div>
        )}
        {shifts[2] && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-50 border border-purple-200 rounded-sm" />
            {shifts[2].name}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-orange-600 font-medium">●</span> Especialista
        </div>
        <div>p = personas | HC = Headcount total</div>
      </div>
    </div>
  );
}
