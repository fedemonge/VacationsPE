import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  parseAttendanceCSV,
  parseAttendanceXLSX,
  parseAttendanceTXT,
  calculateDailyAttendance,
  matchEmployeeByName,
} from "@/lib/payroll/attendance-calculator";
import type { ParsedAttendanceRow } from "@/lib/payroll/attendance-calculator";

/**
 * POST /api/planilla/asistencia/importar
 * Import biometric clock CSV and calculate OT/tardiness per day.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let rows: ParsedAttendanceRow[] = [];
  let periodYear: number;
  let periodMonth: number;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    periodYear = parseInt(formData.get("periodYear") as string) || new Date().getFullYear();
    periodMonth = parseInt(formData.get("periodMonth") as string) || (new Date().getMonth() + 1);

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      rows = parseAttendanceXLSX(buffer);
    } else if (fileName.endsWith(".txt")) {
      const content = await file.text();
      rows = parseAttendanceTXT(content);
    } else {
      const content = await file.text();
      rows = parseAttendanceCSV(content);
    }
  } else {
    const body = await req.json();
    if (!body.csv) {
      return NextResponse.json({ error: "CSV vacío" }, { status: 400 });
    }
    rows = parseAttendanceCSV(body.csv);
    periodYear = body.periodYear || new Date().getFullYear();
    periodMonth = body.periodMonth || (new Date().getMonth() + 1);
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No se encontraron registros válidos en el archivo" }, { status: 400 });
  }

  // Load employees with payroll data
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      shift: true,
    },
  });

  // Load grace minutes from config
  const graceConfig = await prisma.systemConfiguration.findUnique({
    where: { key: "TOLERANCIA_TARDANZA_MINUTOS" },
  });
  const graceMinutes = graceConfig ? parseInt(graceConfig.value) || 5 : 5;

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const unmatchedNames = new Set<string>();

  // Group rows by employee name
  const groupedByName = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.employeeName;
    if (!groupedByName.has(key)) groupedByName.set(key, []);
    groupedByName.get(key)!.push(row);
  }

  for (const [biometricName, empRows] of Array.from(groupedByName.entries())) {
    const matched = matchEmployeeByName(biometricName, employees);
    if (!matched) {
      unmatchedNames.add(biometricName);
      skipped += empRows.length;
      continue;
    }

    // Get shift config
    const shift = matched.shift;
    const shiftConfig = shift
      ? {
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes,
          effectiveHours: shift.effectiveHours,
        }
      : { startTime: "08:00", endTime: "17:30", breakMinutes: 60, effectiveHours: 8.5 };

    for (const row of empRows) {
      const calc = calculateDailyAttendance(
        row.clockIn,
        row.clockOut,
        row.hoursWorked,
        shiftConfig,
        graceMinutes
      );

      try {
        await prisma.attendanceRecord.upsert({
          where: {
            employeeId_date: {
              employeeId: matched.id,
              date: row.date,
            },
          },
          create: {
            employeeId: matched.id,
            employeeCode: matched.employeeCode,
            employeeName: matched.fullName,
            date: row.date,
            clockIn: row.clockIn,
            clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked,
            scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours,
            tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent,
            isHoliday: false,
            source: "BIOMETRICO",
            periodYear,
            periodMonth,
          },
          update: {
            clockIn: row.clockIn,
            clockOut: row.clockOut,
            hoursWorked: calc.hoursWorked,
            scheduledHours: calc.scheduledHours,
            overtimeHours: calc.overtimeHours,
            tardinessMinutes: calc.tardinessMinutes,
            isAbsent: calc.isAbsent,
            source: "BIOMETRICO",
          },
        });
        imported++;
      } catch (err) {
        errors.push(`${biometricName} (${row.date.toISOString().split("T")[0]}): ${err instanceof Error ? err.message : "error"}`);
        skipped++;
      }
    }
  }

  console.log(`[ASISTENCIA] Import: ${imported} imported, ${skipped} skipped, ${unmatchedNames.size} unmatched`);
  return NextResponse.json({
    imported,
    skipped,
    errors,
    unmatchedNames: Array.from(unmatchedNames),
    graceMinutesUsed: graceMinutes,
  });
}
