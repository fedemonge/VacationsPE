import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureEmployeeColumns } from "@/lib/ensure-employee-schema";

function isSelfSupervisorPosition(position: string): boolean {
  const p = position.toLowerCase().trim();
  return p === "gerente general" || p === "country manager";
}

export async function GET(request: NextRequest) {
  await ensureEmployeeColumns();

  const { searchParams } = new URL(request.url);
  const costCenter = searchParams.get("costCenter");
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (costCenter) where.costCenter = costCenter;
  if (active === "true") where.terminationDate = null;
  if (active === "false") where.terminationDate = { not: null };

  try {
    const employees = await prisma.employee.findMany({
      where,
      include: { shift: true },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json({ employees });
  } catch (error) {
    console.error("[EMPLEADOS GET] ERROR:", error);
    return NextResponse.json({ error: "Error al cargar empleados" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureEmployeeColumns();
  try {
    const body = await request.json();
    const {
      employeeCode,
      fullName: rawFullName,
      firstName: rawFirstName,
      lastName: rawLastName,
      email,
      hireDate,
      terminationDate,
      costCenter,
      costCenterDesc,
      supervisorName,
      supervisorEmail,
      position,
      // Payroll fields
      documentType,
      documentNumber,
      birthDate,
      gender,
      contractType,
      contractStart,
      contractEnd,
      baseSalary,
      pensionSystem,
      pensionProvider,
      hasDependents,
      has5taCatExemption,
      bankName,
      bankAccountNumber,
      shiftId,
    } = body;

    // Compute fullName from firstName/lastName if provided, or use rawFullName
    const firstName = (rawFirstName || "").trim();
    const lastName = (rawLastName || "").trim();
    const fullName = (firstName && lastName)
      ? `${lastName} ${firstName}`
      : rawFullName || `${lastName} ${firstName}`.trim();

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

    // Enforce self-supervisor for Gerente General / Country Manager
    const finalSupervisorName = isSelfSupervisorPosition(position) ? fullName : supervisorName;
    const finalSupervisorEmail = isSelfSupervisorPosition(position) ? email : supervisorEmail;

    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        fullName,
        firstName,
        lastName,
        email,
        hireDate: new Date(hireDate),
        terminationDate: terminationDate ? new Date(terminationDate) : null,
        costCenter,
        costCenterDesc: costCenterDesc || "",
        supervisorName: finalSupervisorName,
        supervisorEmail: finalSupervisorEmail,
        position,
        // Payroll fields
        ...(documentType && { documentType }),
        ...(documentNumber && { documentNumber }),
        ...(birthDate && { birthDate: new Date(birthDate) }),
        ...(gender && { gender }),
        ...(contractType && { contractType }),
        ...(contractStart && { contractStart: new Date(contractStart) }),
        ...(contractEnd && { contractEnd: new Date(contractEnd) }),
        ...(baseSalary !== undefined && { baseSalary: parseFloat(baseSalary) || 0 }),
        ...(pensionSystem && { pensionSystem }),
        ...(pensionProvider !== undefined && { pensionProvider: pensionProvider || null }),
        ...(hasDependents !== undefined && { hasDependents }),
        ...(has5taCatExemption !== undefined && { has5taCatExemption }),
        ...(bankName !== undefined && { bankName: bankName || null }),
        ...(bankAccountNumber !== undefined && { bankAccountNumber: bankAccountNumber || null }),
        ...(shiftId !== undefined && { shiftId: shiftId || null }),
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
