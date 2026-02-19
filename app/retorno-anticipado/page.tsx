"use client";

import { useState, useEffect } from "react";
import { countWords } from "@/lib/utils/word-count";

interface ActiveVacation {
  id: string;
  employeeName: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
}

export default function RetornoAnticipadoPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [activeVacations, setActiveVacations] = useState<ActiveVacation[]>([]);
  const [selectedVacation, setSelectedVacation] = useState<ActiveVacation | null>(null);
  const [returnDate, setReturnDate] = useState("");
  const [employeeJustification, setEmployeeJustification] = useState("");
  const [approverJustification, setApproverJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const employeeWordCount = countWords(employeeJustification);
  const approverWordCount = countWords(approverJustification);
  const minWords = 50;

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => setError("Error al cargar empleados"));
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setActiveVacations([]);
      return;
    }
    fetch(`/api/solicitudes?employeeId=${selectedEmployeeId}&status=APROBADA`)
      .then((r) => r.json())
      .then((data) => {
        const now = new Date();
        const active = (data.solicitudes || []).filter((s: ActiveVacation) => {
          const from = new Date(s.dateFrom);
          const to = new Date(s.dateTo);
          return from <= now && to >= now;
        });
        setActiveVacations(active);
      })
      .catch(() => setActiveVacations([]));
  }, [selectedEmployeeId]);

  function handleVacationSelect(vacationId: string) {
    const vac = activeVacations.find((v) => v.id === vacationId) || null;
    setSelectedVacation(vac);
    setReturnDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVacation || !returnDate) return;
    if (employeeWordCount < minWords || approverWordCount < minWords) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/retorno-anticipado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacationRequestId: selectedVacation.id,
          employeeId: selectedEmployeeId,
          returnDate,
          employeeJustification,
          approverJustification,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear la solicitud");
      } else {
        setSuccess("Solicitud de retorno anticipado creada exitosamente.");
        setSelectedVacation(null);
        setReturnDate("");
        setEmployeeJustification("");
        setApproverJustification("");
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Retorno Anticipado de Vacaciones
      </h1>
      <p className="text-gray-500 mb-8">
        Tanto el solicitante como el aprobador de primer nivel deben justificar
        el retorno anticipado en al menos 50 palabras.
      </p>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Employee Selector */}
        <div>
          <label className="label-field">Empleado</label>
          <select
            className="input-field"
            value={selectedEmployeeId}
            onChange={(e) => {
              setSelectedEmployeeId(e.target.value);
              setSelectedVacation(null);
            }}
            required
          >
            <option value="">Seleccione un empleado...</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.employeeCode} - {emp.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Active Vacation Selector */}
        <div>
          <label className="label-field">Periodo de Vacaciones Activo</label>
          {activeVacations.length === 0 && selectedEmployeeId ? (
            <p className="text-sm text-gray-400 italic">
              No hay vacaciones activas para este empleado.
            </p>
          ) : (
            <select
              className="input-field"
              value={selectedVacation?.id || ""}
              onChange={(e) => handleVacationSelect(e.target.value)}
              required
              disabled={activeVacations.length === 0}
            >
              <option value="">Seleccione un periodo...</option>
              {activeVacations.map((vac) => (
                <option key={vac.id} value={vac.id}>
                  {new Date(vac.dateFrom).toLocaleDateString("es-PE")} -{" "}
                  {new Date(vac.dateTo).toLocaleDateString("es-PE")} ({vac.totalDays} días)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Return Date */}
        {selectedVacation && (
          <div>
            <label className="label-field">Fecha de Retorno</label>
            <input
              type="date"
              className="input-field"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              min={new Date(selectedVacation.dateFrom).toISOString().split("T")[0]}
              max={new Date(selectedVacation.dateTo).toISOString().split("T")[0]}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Debe estar dentro del periodo activo seleccionado.
            </p>
          </div>
        )}

        {/* Employee Justification */}
        <div>
          <label className="label-field">
            Justificación del Empleado
          </label>
          <textarea
            className="input-field min-h-[120px]"
            value={employeeJustification}
            onChange={(e) => setEmployeeJustification(e.target.value)}
            placeholder="Explique detalladamente el motivo del retorno anticipado..."
            required
          />
          <p
            className={`text-xs mt-1 font-medium ${
              employeeWordCount >= minWords ? "text-green-600" : "text-red-500"
            }`}
          >
            {employeeWordCount} / {minWords} palabras mínimas
          </p>
        </div>

        {/* Approver Justification */}
        <div>
          <label className="label-field">
            Justificación del Aprobador Nivel 1
          </label>
          <textarea
            className="input-field min-h-[120px]"
            value={approverJustification}
            onChange={(e) => setApproverJustification(e.target.value)}
            placeholder="El supervisor directo debe justificar la aprobación del retorno anticipado..."
            required
          />
          <p
            className={`text-xs mt-1 font-medium ${
              approverWordCount >= minWords ? "text-green-600" : "text-red-500"
            }`}
          >
            {approverWordCount} / {minWords} palabras mínimas
          </p>
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            loading ||
            !selectedVacation ||
            !returnDate ||
            employeeWordCount < minWords ||
            approverWordCount < minWords
          }
        >
          {loading
            ? "Enviando solicitud..."
            : "Enviar Solicitud de Retorno Anticipado"}
        </button>
      </form>
    </div>
  );
}
