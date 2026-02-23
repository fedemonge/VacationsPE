import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { consumeVacationDaysFIFO } from "@/lib/balance/consumption";

// POST: approve or reject a request at the current level
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { requestId, decision, comments } = body;

    if (!requestId || !decision) {
      return NextResponse.json(
        { error: "ID de solicitud y decisión son obligatorios" },
        { status: 400 }
      );
    }

    if (!["APROBADO", "RECHAZADO"].includes(decision)) {
      return NextResponse.json(
        { error: "Decisión inválida" },
        { status: 400 }
      );
    }

    // Get the request
    const solicitud = await prisma.vacationRequest.findUnique({
      where: { id: requestId },
      include: { employee: true },
    });

    if (!solicitud) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const currentLevel = solicitud.currentApprovalLevel;

    // Validate that the user can approve at this level
    const canApprove = await validateApprover(
      session.email,
      session.role,
      currentLevel,
      solicitud.supervisorEmail,
      solicitud.supervisorName
    );

    if (!canApprove) {
      return NextResponse.json(
        {
          error: `No tiene permisos para aprobar en el nivel ${currentLevel}. ` +
            getApproverHint(currentLevel),
        },
        { status: 403 }
      );
    }

    // Check that the request is pending at this level
    const expectedStatus = `NIVEL_${currentLevel}_PENDIENTE`;
    if (solicitud.status !== expectedStatus) {
      return NextResponse.json(
        {
          error: `Esta solicitud no está pendiente en el nivel ${currentLevel}. Estado actual: ${solicitud.status}`,
        },
        { status: 400 }
      );
    }

    // Get approver name from employee table or session
    const approverEmployee = await prisma.employee.findFirst({
      where: { email: session.email },
    });
    const approverName = approverEmployee?.fullName || session.email;

    // Record the approval decision
    await prisma.approvalRecord.create({
      data: {
        requestId,
        requestType: "VACACIONES",
        approverEmail: session.email,
        approverName,
        level: currentLevel,
        status: decision,
        decidedAt: new Date(),
        comments: comments || null,
      },
    });

    if (decision === "RECHAZADO") {
      await prisma.vacationRequest.update({
        where: { id: requestId },
        data: { status: "RECHAZADA" },
      });

      console.log(
        `[APROBACION] RECHAZADA: ${requestId} en nivel ${currentLevel} por ${approverName} (${session.email})`
      );

      return NextResponse.json({
        message: `Solicitud rechazada en nivel ${currentLevel}`,
        status: "RECHAZADA",
      });
    }

    // APROBADO
    if (currentLevel < 3) {
      const nextLevel = currentLevel + 1;
      const nextStatus = `NIVEL_${nextLevel}_PENDIENTE`;
      await prisma.vacationRequest.update({
        where: { id: requestId },
        data: { status: nextStatus, currentApprovalLevel: nextLevel },
      });

      console.log(
        `[APROBACION] NIVEL ${currentLevel} APROBADO: ${requestId} por ${approverName} → nivel ${nextLevel}`
      );

      return NextResponse.json({
        message: `Aprobado en nivel ${currentLevel}. Avanza a nivel ${nextLevel}.`,
        status: nextStatus,
      });
    }

    // Final approval (level 3) - consume vacation days FIFO
    await prisma.vacationRequest.update({
      where: { id: requestId },
      data: { status: "APROBADA", currentApprovalLevel: 3 },
    });

    const result = await consumeVacationDaysFIFO(
      solicitud.employeeId,
      requestId,
      solicitud.totalDays
    );

    console.log(
      `[APROBACION] APROBADA FINAL: ${requestId} - ${solicitud.totalDays} días consumidos FIFO por ${approverName}`,
      result.consumptions
    );

    return NextResponse.json({
      message: `Solicitud aprobada en nivel final. ${solicitud.totalDays} días consumidos del saldo.`,
      status: "APROBADA",
    });
  } catch (error) {
    console.error("[APROBACION] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar la decisión" },
      { status: 500 }
    );
  }
}

async function validateApprover(
  email: string,
  role: string,
  level: number,
  supervisorEmail: string,
  supervisorName: string
): Promise<boolean> {
  // Check if email matches either supervisorEmail or supervisorName (which may contain an email)
  function isSupervisorMatch(): boolean {
    const e = email.toLowerCase();
    if (supervisorEmail && supervisorEmail.toLowerCase() === e) return true;
    if (supervisorName && supervisorName.toLowerCase() === e) return true;
    return false;
  }

  // Level 1: Supervisor (must match the employee's supervisor) OR ADMINISTRADOR
  if (level === 1) {
    if (role === "ADMINISTRADOR") return true;
    if (isSupervisorMatch()) return true;
    return false;
  }

  // Level 2: RRHH or ADMINISTRADOR
  if (level === 2) {
    if (role === "ADMINISTRADOR" || role === "RRHH") return true;
    // Also check SystemConfiguration for ANALISTA_RRHH_EMAIL
    const rrhhConfig = await prisma.systemConfiguration.findFirst({
      where: { key: "ANALISTA_RRHH_EMAIL" },
    });
    if (rrhhConfig && rrhhConfig.value === email) return true;
    return false;
  }

  // Level 3: Gerente País or ADMINISTRADOR
  if (level === 3) {
    if (role === "ADMINISTRADOR" || role === "GERENTE_PAIS") return true;
    // Also check SystemConfiguration for GERENTE_PAIS_EMAIL
    const gerenteConfig = await prisma.systemConfiguration.findFirst({
      where: { key: "GERENTE_PAIS_EMAIL" },
    });
    if (gerenteConfig && gerenteConfig.value === email) return true;
    return false;
  }

  return false;
}

function getApproverHint(level: number): string {
  switch (level) {
    case 1:
      return "Solo el supervisor directo del empleado puede aprobar en nivel 1.";
    case 2:
      return "Solo el analista de RRHH puede aprobar en nivel 2.";
    case 3:
      return "Solo el Gerente País puede aprobar en nivel 3.";
    default:
      return "";
  }
}
