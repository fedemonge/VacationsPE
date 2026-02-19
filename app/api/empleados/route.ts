import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const costCenter = searchParams.get("costCenter");
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (costCenter) where.costCenter = costCenter;
  if (active === "true") where.terminationDate = null;
  if (active === "false") where.terminationDate = { not: null };

  const employees = await prisma.employee.findMany({
    where,
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({ employees });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeCode,
      fullName,
      email,
      hireDate,
      costCenter,
      supervisorName,
      supervisorEmail,
      position,
    } = body;

    if (!employeeCode || !fullName || !email || !hireDate || !costCenter || !supervisorName || !supervisorEmail || !position) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios" },
        { status: 400 }
      );
    }

    const existing = await prisma.employee.findFirst({
      where: { OR: [{ employeeCode }, { email }] },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un empleado con ese código o email" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        fullName,
        email,
        hireDate: new Date(hireDate),
        costCenter,
        supervisorName,
        supervisorEmail,
        position,
      },
    });

    console.log(`[EMPLEADO] CREADO: ${employee.employeeCode} - ${employee.fullName}`);

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("[EMPLEADO] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
