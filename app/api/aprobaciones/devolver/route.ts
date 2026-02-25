import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface RequestInfo {
  id: string;
  status: string;
  currentApprovalLevel: number;
  requestType: "VACACIONES" | "RETORNO_ANTICIPADO" | "VACACIONES_DINERO" | "NUEVA_POSICION" | "CONTRATACION";
}

async function getRequestInfo(
  requestId: string,
  requestType: string
): Promise<RequestInfo | null> {
  if (requestType === "RETORNO_ANTICIPADO") {
    const retorno = await prisma.earlyReturnRequest.findUnique({
      where: { id: requestId },
    });
    if (!retorno) return null;
    return {
      id: retorno.id,
      status: retorno.status,
      currentApprovalLevel: retorno.currentApprovalLevel,
      requestType: "RETORNO_ANTICIPADO",
    };
  }

  if (requestType === "VACACIONES_DINERO") {
    const cashOut = await prisma.vacationCashOutRequest.findUnique({
      where: { id: requestId },
    });
    if (!cashOut) return null;
    return {
      id: cashOut.id,
      status: cashOut.status,
      currentApprovalLevel: cashOut.currentApprovalLevel,
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
      requestType: staffReq.requestType as "NUEVA_POSICION" | "CONTRATACION",
    };
  }

  const solicitud = await prisma.vacationRequest.findUnique({
    where: { id: requestId },
  });
  if (!solicitud) return null;
  return {
    id: solicitud.id,
    status: solicitud.status,
    currentApprovalLevel: solicitud.currentApprovalLevel,
    requestType: "VACACIONES",
  };
}

async function updateRequestStatus(
  requestId: string,
  requestType: string,
  data: { status: string; currentApprovalLevel: number }
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

// POST: return a request to the previous approval level
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
    const { requestId, comments, requestType = "VACACIONES" } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: "ID de solicitud es obligatorio" },
        { status: 400 }
      );
    }

    const solicitud = await getRequestInfo(requestId, requestType);

    if (!solicitud) {
      return NextResponse.json(
        { error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const currentLevel = solicitud.currentApprovalLevel;

    if (currentLevel <= 1) {
      return NextResponse.json(
        { error: "No se puede devolver una solicitud que está en el nivel 1" },
        { status: 400 }
      );
    }

    const expectedStatus = `NIVEL_${currentLevel}_PENDIENTE`;
    if (solicitud.status !== expectedStatus) {
      return NextResponse.json(
        { error: `Esta solicitud no está pendiente en el nivel ${currentLevel}` },
        { status: 400 }
      );
    }

    // Validate that the user can return at this level
    const canReturn = validateReturner(session.email, session.role, currentLevel);
    if (!canReturn) {
      return NextResponse.json(
        { error: "No tiene permisos para devolver esta solicitud" },
        { status: 403 }
      );
    }

    // Get approver name
    const approverEmployee = await prisma.employee.findFirst({
      where: { email: session.email },
    });
    const approverName = approverEmployee?.fullName || session.email;

    // Record the return action
    await prisma.approvalRecord.create({
      data: {
        requestId,
        requestType: solicitud.requestType,
        approverEmail: session.email,
        approverName,
        level: currentLevel,
        status: "DEVUELTO",
        decidedAt: new Date(),
        comments: comments || "Devuelto al nivel anterior",
      },
    });

    // Move back to previous level
    const prevLevel = currentLevel - 1;
    const prevStatus = `NIVEL_${prevLevel}_PENDIENTE`;

    await updateRequestStatus(requestId, requestType, {
      status: prevStatus,
      currentApprovalLevel: prevLevel,
    });

    console.log(
      `[APROBACION] DEVUELTO: ${solicitud.requestType} ${requestId} de nivel ${currentLevel} a nivel ${prevLevel} por ${approverName} (${session.email})`
    );

    return NextResponse.json({
      message: `Solicitud devuelta al nivel ${prevLevel} (${getLevelLabel(prevLevel)}).`,
      status: prevStatus,
    });
  } catch (error) {
    console.error("[APROBACION] DEVOLVER ERROR:", error);
    return NextResponse.json(
      { error: "Error al devolver la solicitud" },
      { status: 500 }
    );
  }
}

function validateReturner(email: string, role: string, level: number): boolean {
  if (role === "ADMINISTRADOR") return true;
  if (level === 2 && role === "RRHH") return true;
  if (level === 3 && role === "GERENTE_PAIS") return true;
  return false;
}

function getLevelLabel(level: number): string {
  switch (level) {
    case 1: return "Supervisor";
    case 2: return "RRHH";
    case 3: return "Gerente General";
    default: return `Nivel ${level}`;
  }
}
