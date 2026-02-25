import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableCashOut } from "@/lib/balance/consumption";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const checkAvailability = searchParams.get("checkAvailability");

  // If checkAvailability is set, return cash-out availability for that employee
  if (checkAvailability && employeeId) {
    const availability = await getAvailableCashOut(employeeId);
    return NextResponse.json({ availability });
  }

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;

  const cashOuts = await prisma.vacationCashOutRequest.findMany({
    where,
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  });

  // Manually fetch approval records for each cash-out (polymorphic relation)
  const cashOutsWithRecords = await Promise.all(
    cashOuts.map(async (co) => {
      const approvalRecords = await prisma.approvalRecord.findMany({
        where: { requestId: co.id },
        orderBy: { createdAt: "asc" },
      });
      return { ...co, approvalRecords };
    })
  );

  return NextResponse.json({ cashOuts: cashOutsWithRecords });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, daysRequested } = body;

    if (!employeeId || !daysRequested) {
      return NextResponse.json(
        { error: "Empleado y días solicitados son obligatorios" },
        { status: 400 }
      );
    }

    if (daysRequested < 1) {
      return NextResponse.json(
        { error: "Los días solicitados deben ser al menos 1" },
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

    // Validate cash-out availability (15-day cap per accrual period, FIFO)
    const cashOutBalance = await getAvailableCashOut(employeeId);
    if (cashOutBalance.totalAvailable < daysRequested) {
      return NextResponse.json(
        {
          error: `Saldo disponible para pago en dinero: ${cashOutBalance.totalAvailable} días. Solicitado: ${daysRequested} días. (Máximo 15 días por periodo de devengamiento)`,
        },
        { status: 400 }
      );
    }

    // Check for existing pending cash-out
    const existingPending = await prisma.vacationCashOutRequest.findFirst({
      where: {
        employeeId,
        status: {
          notIn: ["RECHAZADA", "CANCELADA", "APROBADA"],
        },
      },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: "Ya existe una solicitud de vacaciones en dinero pendiente para este empleado" },
        { status: 400 }
      );
    }

    const cashOut = await prisma.vacationCashOutRequest.create({
      data: {
        employeeId,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        employeeEmail: employee.email,
        supervisorName: employee.supervisorName,
        supervisorEmail: employee.supervisorEmail,
        daysRequested,
        status: "NIVEL_1_PENDIENTE",
        currentApprovalLevel: 1,
      },
    });

    console.log(
      `[VACACIONES_DINERO] CREADA: ${cashOut.id} - ${employee.fullName} - ${daysRequested} días`
    );

    return NextResponse.json(cashOut, { status: 201 });
  } catch (error) {
    console.error("[VACACIONES_DINERO] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
