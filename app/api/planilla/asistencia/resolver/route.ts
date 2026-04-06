import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  parseAttendanceCSV,
  parseAttendanceXLSX,
  parseAttendanceTXT,
  calculateDailyAttendance,
} from "@/lib/payroll/attendance-calculator";
import type { ParsedAttendanceRow } from "@/lib/payroll/attendance-calculator";

/**
 * POST /api/planilla/asistencia/resolver
 * Resolve unmatched attendance rows by either:
 * 1. Assigning to an existing employee (action: "assign")
 * 2. Creating a new employee and importing (action: "create")
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { action, biometricName, periodYear, periodMonth } = body;

  if (!action || !biometricName || !periodYear || !periodMonth) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Retrieve stored file data from the pending upload
  const fileData = body.fileData as ParsedAttendanceRow[] | undefined;

  // If no pre-parsed rows, we need to re-parse from the stored buffer
  // For simplicity, the frontend will send the rows for the specific biometric name
  const rows: ParsedAttendanceRow[] = (body.rows || []).map((r: { employeeName: string; clockIn: string; clockOut: string | null; hoursWorked: number; date: string }) => ({
    employeeName: r.employeeName,
    clockIn: r.clockIn ? new Date(r.clockIn) : null,
    clockOut: r.clockOut ? new Date(r.clockOut) : null,
    hoursWorked: r.hoursWorked,
    date: new Date(r.date),
  }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No hay filas para procesar" }, { status: 400 });
  }

  let employeeId: string;
  let employeeCode: string;
  let employeeName: string;

  if (action === "assign") {
    // Assign to existing employee
    const { targetEmployeeId } = body;
    if (!targetEmployeeId) {
      return NextResponse.json({ error: "Falta empleado destino" }, { status: 400 });
    }
    const emp = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      include: { shift: true },
    });
    if (!emp) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }
    employeeId = emp.id;
    employeeCode = emp.employeeCode;
    employeeName = emp.fullName;

    // Import rows for this employee
    const shift = emp.shift;
    const shiftConfig = shift
      ? { startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, effectiveHours: shift.effectiveHours }
      : { startTime: "08:00", endTime: "17:30", breakMinutes: 60, effectiveHours: 8.5 };

    const graceConfig = await prisma.systemConfiguration.findUnique({ where: { key: "TOLERANCIA_TARDANZA_MINUTOS" } });
    const graceMinutes = graceConfig ? parseInt(graceConfig.value) || 5 : 5;

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const calc = calculateDailyAttendance(row.clockIn, row.clockOut, row.hoursWorked, shiftConfig, graceMinutes);
      try {
        await prisma.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId, date: row.date } },
          create: {
            employeeId, employeeCode, employeeName,
            date: row.date, clockIn: row.clockIn, clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked, scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours, tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent, isHoliday: false, source: "BIOMETRICO",
            periodYear, periodMonth,
          },
          update: {
            clockIn: row.clockIn, clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked, scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours, tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent, source: "BIOMETRICO",
          },
        });
        imported++;
      } catch (err) {
        errors.push(`${row.date}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    return NextResponse.json({ success: true, action: "assign", imported, errors, employeeName });

  } else if (action === "create") {
    // Create new employee with minimal data, then import rows
    const { newEmployee } = body;
    if (!newEmployee || !newEmployee.employeeCode || (!newEmployee.fullName && !newEmployee.lastName)) {
      return NextResponse.json({ error: "Datos del nuevo empleado incompletos" }, { status: 400 });
    }

    // Compute names
    const firstName = (newEmployee.firstName || "").trim();
    const lastName = (newEmployee.lastName || "").trim();
    const fullName = (firstName && lastName)
      ? `${lastName} ${firstName}`
      : newEmployee.fullName || `${lastName} ${firstName}`.trim();

    // Check for duplicate code
    const existingCode = await prisma.employee.findUnique({ where: { employeeCode: newEmployee.employeeCode } });
    if (existingCode) {
      return NextResponse.json({ error: `Código ${newEmployee.employeeCode} ya existe` }, { status: 409 });
    }

    // Check for duplicate email
    const email = newEmployee.email || `${newEmployee.employeeCode.toLowerCase()}@pendiente.com`;
    const existingEmail = await prisma.employee.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: `Email ${email} ya existe` }, { status: 409 });
    }

    const emp = await prisma.employee.create({
      data: {
        employeeCode: newEmployee.employeeCode,
        fullName,
        firstName,
        lastName,
        email,
        hireDate: newEmployee.hireDate ? new Date(newEmployee.hireDate) : new Date(),
        costCenter: newEmployee.costCenter || "PENDIENTE",
        costCenterDesc: newEmployee.costCenterDesc || "",
        supervisorName: newEmployee.supervisorName || "PENDIENTE",
        supervisorEmail: newEmployee.supervisorEmail || "pendiente@woden.com.pe",
        position: newEmployee.position || "PENDIENTE",
        baseSalary: newEmployee.baseSalary || 0,
      },
    });

    employeeId = emp.id;
    employeeCode = emp.employeeCode;
    employeeName = emp.fullName;

    // Import rows
    const shiftConfig = { startTime: "08:00", endTime: "17:30", breakMinutes: 60, effectiveHours: 8.5 };
    const graceConfig = await prisma.systemConfiguration.findUnique({ where: { key: "TOLERANCIA_TARDANZA_MINUTOS" } });
    const graceMinutes = graceConfig ? parseInt(graceConfig.value) || 5 : 5;

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const calc = calculateDailyAttendance(row.clockIn, row.clockOut, row.hoursWorked, shiftConfig, graceMinutes);
      try {
        await prisma.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId, date: row.date } },
          create: {
            employeeId, employeeCode, employeeName,
            date: row.date, clockIn: row.clockIn, clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked, scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours, tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent, isHoliday: false, source: "BIOMETRICO",
            periodYear, periodMonth,
          },
          update: {
            clockIn: row.clockIn, clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked, scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours, tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent, source: "BIOMETRICO",
          },
        });
        imported++;
      } catch (err) {
        errors.push(`${row.date}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    return NextResponse.json({ success: true, action: "create", imported, errors, employeeId, employeeName });

  } else {
    return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
  }
}
