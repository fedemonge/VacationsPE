import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/planilla/asistencia/resumen — Period summary per employee
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const periodYear = parseInt(req.nextUrl.searchParams.get("periodYear") || "") || new Date().getFullYear();
  const periodMonth = parseInt(req.nextUrl.searchParams.get("periodMonth") || "") || (new Date().getMonth() + 1);

  const records = await prisma.attendanceRecord.findMany({
    where: { periodYear, periodMonth },
    orderBy: { date: "asc" },
  });

  // Group by employee
  const byEmployee = new Map<string, typeof records>();
  for (const r of records) {
    if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, []);
    byEmployee.get(r.employeeId)!.push(r);
  }

  const summaries = [];
  for (const [employeeId, empRecords] of Array.from(byEmployee.entries())) {
    let daysWorked = 0;
    let daysAbsent = 0;
    let ot25 = 0;
    let ot35 = 0;
    let ot100 = 0;
    let tardinessMin = 0;
    let totalOvertimeHours = 0;

    for (const r of empRecords) {
      if (r.isAbsent) {
        daysAbsent++;
      } else {
        daysWorked++;
      }

      const otHours = r.overtimeHours;
      const isSunday = new Date(r.date).getDay() === 0;
      if (isSunday) {
        ot100 += otHours;
      } else {
        ot25 += Math.min(otHours, 2);
        ot35 += otHours > 2 ? otHours - 2 : 0;
      }

      tardinessMin += r.tardinessMinutes;
      totalOvertimeHours += otHours;
    }

    const first = empRecords[0];
    summaries.push({
      employeeId,
      employeeName: first.employeeName,
      employeeCode: first.employeeCode,
      daysWorked,
      daysAbsent,
      ot25: round2(ot25),
      ot35: round2(ot35),
      ot100: round2(ot100),
      tardinessMin,
      totalOvertimeHours: round2(totalOvertimeHours),
      recordCount: empRecords.length,
    });
  }

  // Sort by name
  summaries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return NextResponse.json(summaries);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
