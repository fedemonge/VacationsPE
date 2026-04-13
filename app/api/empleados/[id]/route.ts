import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isSelfSupervisorPosition(position: string): boolean {
  const p = position.toLowerCase().trim();
  return p === "gerente general" || p === "country manager";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const employee = await prisma.employee.findUnique({
    where: { id: params.id },
    include: {
      vacationRequests: { orderBy: { createdAt: "desc" } },
      vacationAccruals: { orderBy: { accrualYear: "asc" } },
    },
  });

  if (!employee) {
    return NextResponse.json(
      { error: "Empleado no encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json(employee);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    } = body;

    const data: Record<string, unknown> = {};
    if (employeeCode !== undefined) data.employeeCode = employeeCode;

    // Handle firstName/lastName → fullName
    const firstName = rawFirstName !== undefined ? (rawFirstName || "").trim() : undefined;
    const lastName = rawLastName !== undefined ? (rawLastName || "").trim() : undefined;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    // Recompute fullName when first/last change
    if (firstName !== undefined || lastName !== undefined) {
      const fn = firstName ?? "";
      const ln = lastName ?? "";
      if (fn || ln) data.fullName = `${ln} ${fn}`.trim();
    }
    if (rawFullName !== undefined && firstName === undefined && lastName === undefined) data.fullName = rawFullName;
    if (email !== undefined) data.email = email;
    if (hireDate !== undefined) data.hireDate = new Date(hireDate);
    if (terminationDate !== undefined)
      data.terminationDate = terminationDate ? new Date(terminationDate) : null;
    if (costCenter !== undefined) data.costCenter = costCenter;
    if (costCenterDesc !== undefined) data.costCenterDesc = costCenterDesc;
    if (supervisorName !== undefined) data.supervisorName = supervisorName;
    if (supervisorEmail !== undefined) data.supervisorEmail = supervisorEmail;
    if (position !== undefined) data.position = position;
    // Payroll fields
    if (documentType !== undefined) data.documentType = documentType;
    if (documentNumber !== undefined) data.documentNumber = documentNumber || null;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
    if (gender !== undefined) data.gender = gender || null;
    if (contractType !== undefined) data.contractType = contractType;
    if (contractStart !== undefined) data.contractStart = contractStart ? new Date(contractStart) : null;
    if (contractEnd !== undefined) data.contractEnd = contractEnd ? new Date(contractEnd) : null;
    if (baseSalary !== undefined) data.baseSalary = parseFloat(baseSalary) || 0;
    if (pensionSystem !== undefined) data.pensionSystem = pensionSystem;
    if (pensionProvider !== undefined) data.pensionProvider = pensionProvider || null;
    if (hasDependents !== undefined) data.hasDependents = hasDependents;
    if (has5taCatExemption !== undefined) data.has5taCatExemption = has5taCatExemption;
    if (bankName !== undefined) data.bankName = bankName || null;
    if (bankAccountNumber !== undefined) data.bankAccountNumber = bankAccountNumber || null;

    // Enforce self-supervisor for Gerente General / Country Manager
    const effectivePosition = (position ?? (await prisma.employee.findUnique({ where: { id: params.id }, select: { position: true } }))?.position) as string | undefined;
    if (effectivePosition && isSelfSupervisorPosition(effectivePosition)) {
      // Resolve the final name/email from what's being saved or the existing record
      const existing = await prisma.employee.findUnique({
        where: { id: params.id },
        select: { fullName: true, email: true },
      });
      const empName = (data.fullName as string) || existing?.fullName || "";
      const empEmail = (data.email as string) || existing?.email || "";
      data.supervisorName = empName;
      data.supervisorEmail = empEmail;
    }

    const employee = await prisma.employee.update({
      where: { id: params.id },
      data,
    });

    console.log(`[EMPLEADO] ACTUALIZADO: ${employee.employeeCode} - ${employee.fullName}`);

    return NextResponse.json(employee);
  } catch (error) {
    console.error("[EMPLEADO] UPDATE ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar empleado" },
      { status: 500 }
    );
  }
}
