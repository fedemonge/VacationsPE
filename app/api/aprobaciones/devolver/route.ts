import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
    const { requestId, comments } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: "ID de solicitud es obligatorio" },
        { status: 400 }
      );
    }

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
        requestType: "VACACIONES",
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

    await prisma.vacationRequest.update({
      where: { id: requestId },
      data: { status: prevStatus, currentApprovalLevel: prevLevel },
    });

    console.log(
      `[APROBACION] DEVUELTO: ${requestId} de nivel ${currentLevel} a nivel ${prevLevel} por ${approverName} (${session.email})`
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
    case 3: return "Gerente País";
    default: return `Nivel ${level}`;
  }
}
