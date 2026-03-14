import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/planilla/asistencia — List attendance records
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const periodYear = parseInt(req.nextUrl.searchParams.get("periodYear") || "") || new Date().getFullYear();
  const periodMonth = parseInt(req.nextUrl.searchParams.get("periodMonth") || "") || 0;
  const employeeId = req.nextUrl.searchParams.get("employeeId") || "";

  const where: Record<string, unknown> = { periodYear };
  if (periodMonth > 0) where.periodMonth = periodMonth;
  if (employeeId) where.employeeId = employeeId;

  const records = await prisma.attendanceRecord.findMany({
    where,
    orderBy: [{ date: "asc" }, { employeeName: "asc" }],
    take: 5000,
  });

  return NextResponse.json(records);
}
