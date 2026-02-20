import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (
      !session ||
      !["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"].includes(session.role)
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para realizar ajustes de saldo" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId, accrualYear, newAccruedDays, reason, adjustmentType } =
      body;

    if (!employeeId || !accrualYear || newAccruedDays === undefined || !reason) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios: empleado, periodo, días y motivo" },
        { status: 400 }
      );
    }

    if (typeof newAccruedDays !== "number" || newAccruedDays < 0) {
      return NextResponse.json(
        { error: "Los días devengados deben ser un número positivo" },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { error: "El motivo del ajuste debe tener al menos 10 caracteres" },
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

    // Find or create the accrual period
    let accrual = await prisma.vacationAccrual.findUnique({
      where: { employeeId_accrualYear: { employeeId, accrualYear } },
    });

    const previousValue = accrual ? accrual.totalDaysAccrued : 0;

    if (!accrual) {
      // Create new accrual period
      const hireDate = employee.hireDate;
      const accrualStart = new Date(
        accrualYear,
        hireDate.getMonth(),
        hireDate.getDate()
      );
      const accrualEnd = new Date(
        accrualYear + 1,
        hireDate.getMonth(),
        hireDate.getDate()
      );

      accrual = await prisma.vacationAccrual.create({
        data: {
          employeeId,
          accrualYear,
          accrualStartDate: accrualStart,
          accrualEndDate: accrualEnd,
          monthlyRate: 2.5,
          monthsAccrued: Math.round(newAccruedDays / 2.5),
          totalDaysAccrued: newAccruedDays,
          totalDaysConsumed: 0,
          remainingBalance: newAccruedDays,
        },
      });
    } else {
      // Update existing accrual — adjust remaining balance proportionally
      const delta = newAccruedDays - accrual.totalDaysAccrued;
      const newRemaining = Math.max(0, accrual.remainingBalance + delta);

      accrual = await prisma.vacationAccrual.update({
        where: { id: accrual.id },
        data: {
          totalDaysAccrued: newAccruedDays,
          remainingBalance: newRemaining,
          monthsAccrued: Math.round(newAccruedDays / 2.5),
        },
      });
    }

    // Create audit record
    const adjustment = await prisma.balanceAdjustment.create({
      data: {
        employeeId,
        accrualYear,
        adjustmentType: adjustmentType || "AJUSTE_MANUAL",
        previousValue,
        newValue: newAccruedDays,
        daysDelta: newAccruedDays - previousValue,
        reason: reason.trim(),
        adjustedBy: session.email,
      },
    });

    console.log(
      `[SALDO] AJUSTE: ${employee.fullName} periodo ${accrualYear} - ${previousValue} → ${newAccruedDays} días por ${session.email}. Motivo: ${reason}`
    );

    return NextResponse.json(
      { accrual, adjustment, message: "Ajuste registrado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SALDO] ERROR_AJUSTE:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET: list adjustment history
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (
      !session ||
      !["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"].includes(session.role)
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para ver el historial de ajustes" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;

    const adjustments = await prisma.balanceAdjustment.findMany({
      where,
      include: { employee: { select: { fullName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ adjustments });
  } catch (error) {
    console.error("[SALDO] ERROR_HISTORIAL:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
