"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Shift {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  costMultiplier: number;
  isActive: boolean;
}

interface CalendarMonth {
  month: number;
  year: number;
  workingDays: number;
}

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function MRPConfiguracionPage() {
  const { authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"turnos" | "calendario" | "uom">("turnos");

  // UoM state
  const [uoms, setUoms] = useState<{ id: string; code: string; name: string; abbreviation: string; isActive: boolean }[]>([]);
  const [uomLoading, setUomLoading] = useState(true);
  const [uomSaving, setUomSaving] = useState(false);
  const [uomError, setUomError] = useState("");
  const [uomSuccess, setUomSuccess] = useState("");
  const [newUom, setNewUom] = useState({ code: "", name: "", abbreviation: "" });

  // Shifts state
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftsSaving, setShiftsSaving] = useState(false);
  const [shiftsError, setShiftsError] = useState("");
  const [shiftsSuccess, setShiftsSuccess] = useState("");

  // Calendar state
  const currentYear = new Date().getFullYear();
  const [calendarYear, setCalendarYear] = useState(currentYear);
  const [calendar, setCalendar] = useState<CalendarMonth[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarSuccess, setCalendarSuccess] = useState("");

  // Fetch shifts
  // Fetch UoM
  const fetchUoms = useCallback(async () => {
    setUomLoading(true);
    setUomError("");
    try {
      const res = await fetch("/api/remanufactura/mrp/master-data/uom");
      if (!res.ok) throw new Error("Error al cargar unidades");
      const data = await res.json();
      setUoms(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setUomError(e instanceof Error ? e.message : "Error");
    } finally { setUomLoading(false); }
  }, []);

  const addUom = async () => {
    if (!newUom.code || !newUom.name || !newUom.abbreviation) { setUomError("Todos los campos son requeridos"); return; }
    setUomSaving(true); setUomError(""); setUomSuccess("");
    try {
      const res = await fetch("/api/remanufactura/mrp/master-data/uom", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUom),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Error"); }
      setNewUom({ code: "", name: "", abbreviation: "" });
      setUomSuccess("Unidad agregada.");
      fetchUoms();
    } catch (e: unknown) { setUomError(e instanceof Error ? e.message : "Error"); } finally { setUomSaving(false); }
  };

  const deleteUom = async (id: string) => {
    if (!confirm("¿Eliminar esta unidad de medida?")) return;
    try {
      const res = await fetch(`/api/remanufactura/mrp/master-data/uom?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      fetchUoms();
    } catch { setUomError("Error al eliminar"); }
  };

  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    setShiftsError("");
    try {
      const res = await fetch("/api/remanufactura/mrp/admin/shifts");
      if (!res.ok) throw new Error("Error al cargar turnos");
      const data = await res.json();
      setShifts(Array.isArray(data) ? data : data.shifts || []);
    } catch (e: unknown) {
      setShiftsError(e instanceof Error ? e.message : "Error al cargar turnos");
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  // Fetch calendar
  const fetchCalendar = useCallback(async (year: number) => {
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const res = await fetch("/api/remanufactura/mrp/admin/calendar");
      if (!res.ok) throw new Error("Error al cargar calendario");
      const data = await res.json();
      const allMonths: CalendarMonth[] = Array.isArray(data) ? data : data.months || [];
      const yearMonths = allMonths.filter((cm) => cm.year === year);
      const result: CalendarMonth[] = [];
      for (let m = 1; m <= 12; m++) {
        const existing = yearMonths.find((cm) => cm.month === m);
        result.push(existing || { month: m, year, workingDays: 22 });
      }
      setCalendar(result);
    } catch (e: unknown) {
      setCalendarError(e instanceof Error ? e.message : "Error al cargar calendario");
      setCalendar(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year, workingDays: 22 })));
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchUoms();
    fetchShifts();
    fetchCalendar(calendarYear);
  }, [authenticated, fetchUoms, fetchShifts, fetchCalendar, calendarYear]);

  // Shift handlers
  const updateShift = (index: number, field: keyof Shift, value: string | number | boolean) => {
    setShifts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setShiftsSuccess("");
  };

  const addShift = () => {
    setShifts((prev) => [...prev, { name: "", startTime: "06:00", endTime: "14:00", costMultiplier: 1.0, isActive: true }]);
    setShiftsSuccess("");
  };

  const removeShift = (index: number) => {
    setShifts((prev) => prev.filter((_, i) => i !== index));
    setShiftsSuccess("");
  };

  const saveShifts = async () => {
    setShiftsSaving(true);
    setShiftsError("");
    setShiftsSuccess("");
    try {
      const res = await fetch("/api/remanufactura/mrp/admin/shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shifts),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al guardar turnos");
      }
      setShiftsSuccess("Turnos guardados correctamente.");
      fetchShifts();
    } catch (e: unknown) {
      setShiftsError(e instanceof Error ? e.message : "Error al guardar turnos");
    } finally {
      setShiftsSaving(false);
    }
  };

  // Calendar handlers
  const updateCalendarDay = (month: number, value: number) => {
    setCalendar((prev) =>
      prev.map((cm) => (cm.month === month ? { ...cm, workingDays: value } : cm))
    );
    setCalendarSuccess("");
  };

  const saveCalendar = async () => {
    setCalendarSaving(true);
    setCalendarError("");
    setCalendarSuccess("");
    try {
      const res = await fetch("/api/remanufactura/mrp/admin/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calendar),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al guardar calendario");
      }
      setCalendarSuccess("Calendario guardado correctamente.");
    } catch (e: unknown) {
      setCalendarError(e instanceof Error ? e.message : "Error al guardar calendario");
    } finally {
      setCalendarSaving(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="p-8 text-center text-gray-500">
        Inicia sesión para acceder a la configuración MRP.
      </div>
    );
  }

  const tabs = [
    { key: "turnos" as const, label: "Turnos" },
    { key: "calendario" as const, label: "Calendario Laboral" },
    { key: "uom" as const, label: "Unidades de Medida" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración MRP</h1>
          <p className="text-sm text-gray-500 mt-1">
            Administración de turnos y calendario laboral
          </p>
        </div>
        <Link
          href="/remanufactura/mrp"
          className="px-4 py-2 text-sm border border-gray-300 rounded-sm hover:bg-gray-50"
        >
          Volver al Dashboard
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Turnos Tab */}
      {activeTab === "turnos" && (
        <div className="card">
          {shiftsLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Turnos de Trabajo</h2>
                <button
                  onClick={addShift}
                  className="btn-primary text-sm px-4 py-1.5"
                >
                  + Nuevo Turno
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Nombre</th>
                      <th className="table-header">Hora Inicio</th>
                      <th className="table-header">Hora Fin</th>
                      <th className="table-header">Multiplicador Costo</th>
                      <th className="table-header">Activo</th>
                      <th className="table-header w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="table-cell text-center text-gray-400">
                          No hay turnos configurados. Haz clic en &quot;Nuevo Turno&quot; para agregar uno.
                        </td>
                      </tr>
                    ) : (
                      shifts.map((shift, idx) => (
                        <tr key={shift.id || `new-${idx}`} className="border-t border-gray-100">
                          <td className="table-cell">
                            <input
                              type="text"
                              value={shift.name}
                              onChange={(e) => updateShift(idx, "name", e.target.value)}
                              className="input-field text-sm"
                              placeholder="Ej: Mañana"
                            />
                          </td>
                          <td className="table-cell">
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) => updateShift(idx, "startTime", e.target.value)}
                              className="input-field text-sm"
                            />
                          </td>
                          <td className="table-cell">
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) => updateShift(idx, "endTime", e.target.value)}
                              className="input-field text-sm"
                            />
                          </td>
                          <td className="table-cell">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={shift.costMultiplier}
                              onChange={(e) => updateShift(idx, "costMultiplier", parseFloat(e.target.value) || 0)}
                              className="input-field text-sm w-24"
                            />
                          </td>
                          <td className="table-cell">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={shift.isActive}
                                onChange={(e) => updateShift(idx, "isActive", e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
                            </label>
                          </td>
                          <td className="table-cell">
                            <button
                              onClick={() => removeShift(idx)}
                              className="text-red-400 hover:text-red-600 text-sm"
                              title="Eliminar turno"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {shiftsError && (
                <div className="mt-4 p-3 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">
                  {shiftsError}
                </div>
              )}
              {shiftsSuccess && (
                <div className="mt-4 p-3 rounded-sm bg-green-50 border border-green-200 text-green-700 text-sm">
                  {shiftsSuccess}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveShifts}
                  disabled={shiftsSaving || shifts.length === 0}
                  className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
                >
                  {shiftsSaving ? "Guardando..." : "Guardar Turnos"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Calendario Tab */}
      {activeTab === "calendario" && (
        <div className="card">
          <div className="flex items-center gap-4 mb-6">
            <label className="label-field mb-0">Año:</label>
            <select
              value={calendarYear}
              onChange={(e) => setCalendarYear(parseInt(e.target.value))}
              className="input-field text-sm w-32"
            >
              <option value={currentYear}>{currentYear}</option>
              <option value={currentYear + 1}>{currentYear + 1}</option>
            </select>
          </div>

          {calendarLoading ? (
            <div className="animate-pulse">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded" />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {calendar.map((cm) => (
                  <div
                    key={cm.month}
                    className="border border-gray-200 rounded-sm p-4 hover:border-orange-300 transition-colors"
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {MONTH_NAMES[cm.month - 1]}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={cm.workingDays}
                        onChange={(e) => updateCalendarDay(cm.month, parseInt(e.target.value) || 0)}
                        className="input-field text-sm w-20 text-center"
                      />
                      <span className="text-xs text-gray-500">días</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Total: {calendar.reduce((sum, cm) => sum + cm.workingDays, 0)} días laborales en {calendarYear}
                </p>
                <div className="flex items-center gap-3">
                  {calendarError && (
                    <span className="text-sm text-red-600">{calendarError}</span>
                  )}
                  {calendarSuccess && (
                    <span className="text-sm text-green-600">{calendarSuccess}</span>
                  )}
                  <button
                    onClick={saveCalendar}
                    disabled={calendarSaving}
                    className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
                  >
                    {calendarSaving ? "Guardando..." : "Guardar Calendario"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* UoM Tab */}
      {activeTab === "uom" && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Unidades de Medida</h2>
          </div>

          {uomLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Codigo", "Nombre", "Abreviatura", "Acciones"].map((h) => (
                        <th key={h} className="table-header">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uoms.map((u) => (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="table-cell font-mono">{u.code}</td>
                        <td className="table-cell">{u.name}</td>
                        <td className="table-cell">{u.abbreviation}</td>
                        <td className="table-cell">
                          <button onClick={() => deleteUom(u.id)} className="text-red-600 hover:text-red-800 text-xs">Eliminar</button>
                        </td>
                      </tr>
                    ))}
                    {/* Add new row */}
                    <tr className="border-t-2 border-orange-200 bg-orange-50/30">
                      <td className="table-cell">
                        <input className="input-field text-sm" placeholder="Ej: ton" value={newUom.code} onChange={(e) => setNewUom({ ...newUom, code: e.target.value })} />
                      </td>
                      <td className="table-cell">
                        <input className="input-field text-sm" placeholder="Ej: Tonelada" value={newUom.name} onChange={(e) => setNewUom({ ...newUom, name: e.target.value })} />
                      </td>
                      <td className="table-cell">
                        <input className="input-field text-sm" placeholder="Ej: ton" value={newUom.abbreviation} onChange={(e) => setNewUom({ ...newUom, abbreviation: e.target.value })} />
                      </td>
                      <td className="table-cell">
                        <button onClick={addUom} disabled={uomSaving || !newUom.code || !newUom.name || !newUom.abbreviation} className="btn-primary text-xs px-3 py-1 disabled:opacity-50">
                          {uomSaving ? "..." : "+ Agregar"}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {uomError && <div className="mt-3 p-3 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">{uomError}</div>}
              {uomSuccess && <div className="mt-3 p-3 rounded-sm bg-green-50 border border-green-200 text-green-700 text-sm">{uomSuccess}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
