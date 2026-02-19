import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const employee = await prisma.employee.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(employee);
  } catch (error) {
    console.error("[EMPLEADO] UPDATE ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar empleado" },
      { status: 500 }
    );
  }
}
