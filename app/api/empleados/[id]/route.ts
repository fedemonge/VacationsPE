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
      fullName,
      email,
      hireDate,
      terminationDate,
      costCenter,
      costCenterDesc,
      supervisorName,
      supervisorEmail,
      position,
    } = body;

    const data: Record<string, unknown> = {};
    if (employeeCode !== undefined) data.employeeCode = employeeCode;
    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    if (hireDate !== undefined) data.hireDate = new Date(hireDate);
    if (terminationDate !== undefined)
      data.terminationDate = terminationDate ? new Date(terminationDate) : null;
    if (costCenter !== undefined) data.costCenter = costCenter;
    if (costCenterDesc !== undefined) data.costCenterDesc = costCenterDesc;
    if (supervisorName !== undefined) data.supervisorName = supervisorName;
    if (supervisorEmail !== undefined) data.supervisorEmail = supervisorEmail;
    if (position !== undefined) data.position = position;

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
