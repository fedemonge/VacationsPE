import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET: list all employees with their supervisor info
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        email: true,
        supervisorName: true,
        supervisorEmail: true,
        position: true,
        costCenter: true,
      },
      orderBy: { fullName: "asc" },
    });

    return NextResponse.json({ employees });
  } catch (error) {
    console.error("[SUPERVISORES] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener supervisores" },
      { status: 500 }
    );
  }
}

// PATCH: manually update supervisor for one or more employees
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (
      !session ||
      !["ADMINISTRADOR", "RRHH", "GERENTE_PAIS"].includes(session.role)
    ) {
      return NextResponse.json(
        { error: "No tiene permisos para actualizar supervisores" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId, supervisorName, supervisorEmail } = body;

    if (!employeeId || !supervisorName || !supervisorEmail) {
      return NextResponse.json(
        {
          error:
            "ID del empleado, nombre y email del supervisor son obligatorios",
        },
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

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        supervisorName,
        supervisorEmail: supervisorEmail.trim().toLowerCase(),
      },
    });

    console.log(
      `[SUPERVISORES] ACTUALIZADO: ${updated.fullName} → supervisor: ${supervisorName} (${supervisorEmail}) por ${session.email}`
    );

    return NextResponse.json({
      message: `Supervisor de ${updated.fullName} actualizado a ${supervisorName}`,
      employee: updated,
    });
  } catch (error) {
    console.error("[SUPERVISORES] ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar supervisor" },
      { status: 500 }
    );
  }
}

// POST: bulk update supervisors (for Power Automate / O365 sync)
export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret OR session auth
    const authHeader = request.headers.get("x-webhook-secret");
    const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;

    let isWebhook = false;
    if (authHeader && webhookSecret && authHeader === webhookSecret) {
      isWebhook = true;
    } else {
      const session = await getSession();
      if (
        !session ||
        !["ADMINISTRADOR", "RRHH"].includes(session.role)
      ) {
        return NextResponse.json(
          { error: "No autorizado" },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const { employees } = body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json(
        {
          error:
            'Se requiere un arreglo "employees" con datos de supervisores',
        },
        { status: 400 }
      );
    }

    /*
     * Expected format from Power Automate:
     * {
     *   "employees": [
     *     {
     *       "email": "empleado@empresa.com",
     *       "supervisorName": "Nombre del Supervisor",
     *       "supervisorEmail": "supervisor@empresa.com"
     *     },
     *     ...
     *   ]
     * }
     */

    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const entry of employees) {
      const { email, supervisorName, supervisorEmail } = entry;

      if (!email || !supervisorName || !supervisorEmail) {
        errors.push(
          `Datos incompletos para: ${email || "email vacío"}`
        );
        continue;
      }

      const employee = await prisma.employee.findFirst({
        where: { email: email.trim().toLowerCase() },
      });

      if (!employee) {
        notFound++;
        errors.push(`Empleado no encontrado: ${email}`);
        continue;
      }

      const updateData: Record<string, string> = {
        supervisorName,
        supervisorEmail: supervisorEmail.trim().toLowerCase(),
      };
      if (entry.fullName) updateData.fullName = entry.fullName;
      if (entry.position) updateData.position = entry.position;

      await prisma.employee.update({
        where: { id: employee.id },
        data: updateData,
      });

      updated++;
    }

    const source = isWebhook ? "Power Automate" : "importación manual";
    console.log(
      `[SUPERVISORES] SYNC: ${updated} actualizados, ${notFound} no encontrados via ${source}`
    );

    return NextResponse.json({
      message: `Sincronización completada: ${updated} actualizados, ${notFound} no encontrados`,
      updated,
      notFound,
      errors: errors.length > 0 ? errors : undefined,
      total: employees.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SUPERVISORES] SYNC ERROR:", error);
    return NextResponse.json(
      { error: "Error al sincronizar supervisores" },
      { status: 500 }
    );
  }
}
