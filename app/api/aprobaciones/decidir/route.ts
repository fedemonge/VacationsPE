import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { consumeVacationDaysFIFO, consumeCashOutDaysFIFO } from "@/lib/balance/consumption";

interface RequestInfo {
  id: string;
  status: string;
  currentApprovalLevel: number;
  employeeId: string;
  supervisorEmail: string;
  supervisorName: string;
  totalDays: number;
  requestType: "VACACIONES" | "RETORNO_ANTICIPADO" | "VACACIONES_DINERO" | "NUEVA_POSICION" | "CONTRATACION";
}

async function getRequestInfo(
  requestId: string,
  requestType: string
): Promise<RequestInfo | null> {
  if (requestType === "RETORNO_ANTICIPADO") {
    const retorno = await prisma.earlyReturnRequest.findUnique({
      where: { id: requestId },
      include: { employee: true, vacationRequest: true },
    });
    if (!retorno) return null;
    return {
      id: retorno.id,
      status: retorno.status,
      currentApprovalLevel: retorno.currentApprovalLevel,
      employeeId: retorno.employeeId,
      supervisorEmail: retorno.employee.supervisorEmail,
      supervisorName: retorno.employee.supervisorName,
      totalDays: retorno.vacationRequest.totalDays,
      requestType: "RETORNO_ANTICIPADO",
    };
  }

  if (requestType === "VACACIONES_DINERO") {
    const cashOut = await prisma.vacationCashOutRequest.findUnique({
      where: { id: requestId },
      include: { employee: true },
    });
    if (!cashOut) return null;
    return {
      id: cashOut.id,
      status: cashOut.status,
      currentApprovalLevel: cashOut.currentApprovalLevel,
      employeeId: cashOut.employeeId,
      supervisorEmail: cashOut.supervisorEmail,
      supervisorName: cashOut.supervisorName,
      totalDays: cashOut.daysRequested,
      requestType: "VACACIONES_DINERO",
    };
  }

  if (requestType === "NUEVA_POSICION" || requestType === "CONTRATACION") {
    const staffReq = await prisma.staffRequest.findUnique({
      where: { id: requestId },
    });
    if (!staffReq) return null;
    return {
      id: staffReq.id,
      status: staffReq.status,
      currentApprovalLevel: staffReq.currentApprovalLevel,
      employeeId: "",
      supervisorEmail: staffReq.supervisorEmail,
      supervisorName: staffReq.supervisorName,
      totalDays: 0,
      requestType: staffReq.requestType as "NUEVA_POSICION" | "CONTRATACION",
    };
  }

  // Default: VACACIONES
  const solicitud = await prisma.vacationRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  });
  if (!solicitud) return null;
  return {
    id: solicitud.id,
    status: solicitud.status,
    currentApprovalLevel: solicitud.currentApprovalLevel,
    employeeId: solicitud.employeeId,
    supervisorEmail: solicitud.supervisorEmail,
    supervisorName: solicitud.supervisorName,
    totalDays: solicitud.totalDays,
    requestType: "VACACIONES",
  };
}

async function updateRequestStatus(
  requestId: string,
  requestType: string,
  data: { status: string; currentApprovalLevel?: number }
): Promise<void> {
  if (requestType === "RETORNO_ANTICIPADO") {
    await prisma.earlyReturnRequest.update({
      where: { id: requestId },
      data,
    });
  } else if (requestType === "VACACIONES_DINERO") {
    await prisma.vacationCashOutRequest.update({
      where: { id: requestId },
      data,
    });
  } else if (requestType === "NUEVA_POSICION" || requestType === "CONTRATACION") {
    await prisma.staffRequest.update({
      where: { id: requestId },
      data,
    });
  } else {
    await prisma.vacationRequest.update({
      where: { id: requestId },
      data,
    });
  }
}

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
    const { requestId, decision, comments, requestType = "VACACIONES" } = body;

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

    // Get the request (polymorphic)
    const solicitud = await getRequestInfo(requestId, requestType);

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
        requestType: solicitud.requestType,
        approverEmail: session.email,
        approverName,
        level: currentLevel,
        status: decision,
        decidedAt: new Date(),
        comments: comments || null,
      },
    });

    const typeLabel =
      solicitud.requestType === "RETORNO_ANTICIPADO"
        ? "Retorno anticipado"
        : solicitud.requestType === "VACACIONES_DINERO"
        ? "Vacaciones en dinero"
        : solicitud.requestType === "NUEVA_POSICION"
        ? "Solicitud de nueva posición"
        : solicitud.requestType === "CONTRATACION"
        ? "Solicitud de contratación"
        : "Solicitud";

    if (decision === "RECHAZADO") {
      await updateRequestStatus(requestId, requestType, {
        status: "RECHAZADA",
      });

      console.log(
        `[APROBACION] RECHAZADA: ${typeLabel} ${requestId} en nivel ${currentLevel} por ${approverName} (${session.email})`
      );

      return NextResponse.json({
        message: `${typeLabel} rechazado(a) en nivel ${currentLevel}`,
        status: "RECHAZADA",
      });
    }

    // APROBADO
    if (currentLevel < 3) {
      const nextLevel = currentLevel + 1;
      const nextStatus = `NIVEL_${nextLevel}_PENDIENTE`;
      await updateRequestStatus(requestId, requestType, {
        status: nextStatus,
        currentApprovalLevel: nextLevel,
      });

      console.log(
        `[APROBACION] NIVEL ${currentLevel} APROBADO: ${typeLabel} ${requestId} por ${approverName} → nivel ${nextLevel}`
      );

      return NextResponse.json({
        message: `Aprobado en nivel ${currentLevel}. Avanza a nivel ${nextLevel}.`,
        status: nextStatus,
      });
    }

    // Final approval (level 3)
    if (solicitud.requestType === "VACACIONES") {
      // Consume vacation days FIFO
      await updateRequestStatus(requestId, requestType, {
        status: "APROBADA",
        currentApprovalLevel: 3,
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
    }

    // VACACIONES_DINERO final approval
    if (solicitud.requestType === "VACACIONES_DINERO") {
      await updateRequestStatus(requestId, requestType, {
        status: "APROBADA",
        currentApprovalLevel: 3,
      });

      const result = await consumeCashOutDaysFIFO(
        solicitud.employeeId,
        requestId,
        solicitud.totalDays
      );

      console.log(
        `[APROBACION] VACACIONES_DINERO APROBADA FINAL: ${requestId} - ${solicitud.totalDays} días consumidos FIFO por ${approverName}`,
        result.consumptions
      );

      return NextResponse.json({
        message: `Vacaciones en dinero aprobadas en nivel final. ${solicitud.totalDays} días consumidos del saldo.`,
        status: "APROBADA",
      });
    }

    // NUEVA_POSICION / CONTRATACION final approval
    if (solicitud.requestType === "NUEVA_POSICION" || solicitud.requestType === "CONTRATACION") {
      await prisma.staffRequest.update({
        where: { id: requestId },
        data: {
          status: "APROBADA",
          currentApprovalLevel: 3,
          approvedAt: new Date(),
        },
      });

      // For NUEVA_POSICION: auto-create a new OrgPosition with status VACANTE
      if (solicitud.requestType === "NUEVA_POSICION") {
        const staffReq = await prisma.staffRequest.findUnique({
          where: { id: requestId },
        });
        if (staffReq) {
          const lastPos = await prisma.orgPosition.findFirst({
            orderBy: { positionCode: "desc" },
          });
          const nextNum = lastPos
            ? parseInt(lastPos.positionCode.replace("POS-", "")) + 1
            : 1;
          const positionCode = `POS-${String(nextNum).padStart(4, "0")}`;

          const newPosition = await prisma.orgPosition.create({
            data: {
              positionCode,
              title: staffReq.positionTitle,
              costCenter: staffReq.costCenter,
              costCenterDesc: staffReq.costCenterDesc,
              reportsToEmail: staffReq.reportsToEmail,
              positionType: staffReq.positionType,
              status: "VACANTE",
            },
          });

          await prisma.staffRequest.update({
            where: { id: requestId },
            data: { positionId: newPosition.id },
          });

          console.log(
            `[POSICIONES] AUTO-CREADA: ${positionCode} via solicitud ${requestId}`
          );
        }
      }

      console.log(
        `[APROBACION] ${solicitud.requestType} APROBADA FINAL: ${requestId} por ${approverName}`
      );

      return NextResponse.json({
        message: `${typeLabel} aprobada en nivel final.`,
        status: "APROBADA",
      });
    }

    // RETORNO_ANTICIPADO final approval
    await updateRequestStatus(requestId, requestType, {
      status: "APROBADA",
      currentApprovalLevel: 3,
    });

    console.log(
      `[APROBACION] RETORNO APROBADO FINAL: ${requestId} por ${approverName}`
    );

    return NextResponse.json({
      message: "Retorno anticipado aprobado en nivel final.",
      status: "APROBADA",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[APROBACION] ERROR:", msg, error);
    return NextResponse.json(
      { error: `Error al procesar la decisión: ${msg}` },
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

  // Level 3: Gerente General or ADMINISTRADOR
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
      return "Solo el Gerente General puede aprobar en nivel 3.";
    default:
      return "";
  }
}
