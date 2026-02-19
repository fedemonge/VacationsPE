import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { countWords } from "@/lib/utils/word-count";

const MIN_WORDS = 50;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;

  const retornos = await prisma.earlyReturnRequest.findMany({
    where,
    include: { vacationRequest: true, employee: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ retornos });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vacationRequestId,
      employeeId,
      returnDate,
      employeeJustification,
      approverJustification,
    } = body;

    if (!vacationRequestId || !employeeId || !returnDate || !employeeJustification || !approverJustification) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios" },
        { status: 400 }
      );
    }

    // Validate word counts
    if (countWords(employeeJustification) < MIN_WORDS) {
      return NextResponse.json(
        { error: `La justificación del empleado debe tener al menos ${MIN_WORDS} palabras` },
        { status: 400 }
      );
    }

    if (countWords(approverJustification) < MIN_WORDS) {
      return NextResponse.json(
        { error: `La justificación del aprobador debe tener al menos ${MIN_WORDS} palabras` },
        { status: 400 }
      );
    }

    // Validate vacation request exists and is active
    const vacationRequest = await prisma.vacationRequest.findUnique({
      where: { id: vacationRequestId },
    });

    if (!vacationRequest || vacationRequest.status !== "APROBADA") {
      return NextResponse.json(
        { error: "La solicitud de vacaciones no está activa" },
        { status: 400 }
      );
    }

    // Validate return date is within vacation period
    const returnDateObj = new Date(returnDate);
    if (returnDateObj < vacationRequest.dateFrom || returnDateObj > vacationRequest.dateTo) {
      return NextResponse.json(
        { error: "La fecha de retorno debe estar dentro del periodo de vacaciones activo" },
        { status: 400 }
      );
    }

    const retorno = await prisma.earlyReturnRequest.create({
      data: {
        vacationRequestId,
        employeeId,
        returnDate: returnDateObj,
        employeeJustification,
        approverJustification,
        status: "PENDIENTE",
      },
    });

    console.log(
      `[RETORNO] CREADO: ${retorno.id} - vacación ${vacationRequestId} - retorno ${returnDate}`
    );

    return NextResponse.json(retorno, { status: 201 });
  } catch (error) {
    console.error("[RETORNO] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
