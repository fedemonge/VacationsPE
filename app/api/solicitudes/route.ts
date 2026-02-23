import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableBalance } from "@/lib/balance/consumption";
import { calculateVacationDays, getMinVacationStartDate } from "@/lib/utils/dates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const solicitudes = await prisma.vacationRequest.findMany({
    where,
    include: { employee: true, approvalRecords: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ solicitudes });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, dateFrom, dateTo } = body;

    if (!employeeId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");

    // Validate 30-day advance
    const minDate = getMinVacationStartDate();
    if (from < minDate) {
      return NextResponse.json(
        { error: "Las vacaciones deben solicitarse con al menos 30 días de anticipación" },
        { status: 400 }
      );
    }

    if (to < from) {
      return NextResponse.json(
        { error: "La fecha de fin debe ser posterior a la fecha de inicio" },
        { status: 400 }
      );
    }

    const totalDays = calculateVacationDays(from, to);

    // Validate balance
    const balance = await getAvailableBalance(employeeId);
    if (balance.totalAvailable < totalDays) {
      return NextResponse.json(
        {
          error: `Saldo insuficiente. Disponible: ${balance.totalAvailable} días. Solicitado: ${totalDays} días.`,
        },
        { status: 400 }
      );
    }

    // Check for overlapping requests
    const overlapping = await prisma.vacationRequest.findFirst({
      where: {
        employeeId,
        status: { notIn: ["RECHAZADA", "CANCELADA"] },
        OR: [
          { dateFrom: { lte: to }, dateTo: { gte: from } },
        ],
      },
    });

    if (overlapping) {
      return NextResponse.json(
        { error: "Ya existe una solicitud para un periodo que se cruza con las fechas seleccionadas" },
        { status: 400 }
      );
    }

    const solicitud = await prisma.vacationRequest.create({
      data: {
        employeeId,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        employeeEmail: employee.email,
        supervisorName: employee.supervisorName,
        supervisorEmail: employee.supervisorEmail,
        dateFrom: from,
        dateTo: to,
        totalDays,
        status: "NIVEL_1_PENDIENTE",
        currentApprovalLevel: 1,
      },
    });

    // In production, trigger Power Automate webhook here
    console.log(
      `[SOLICITUD] CREADA: ${solicitud.id} - ${employee.fullName} - ${totalDays} días (${dateFrom} a ${dateTo})`
    );

    return NextResponse.json(solicitud, { status: 201 });
  } catch (error) {
    console.error("[SOLICITUD] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
