import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function calculateValues(months: number[]) {
  const effectiveValue = months.reduce((a, b) => a + b, 0);
  const nonZeroMonths = months.filter((v) => v !== 0).length;
  const annualizedValue =
    nonZeroMonths > 0 ? (effectiveValue / nonZeroMonths) * 12 : 0;
  return { effectiveValue, annualizedValue };
}

async function convertToUsd(
  months: number[],
  projectCurrency: string,
  implementationDate: Date | null
): Promise<number[]> {
  if (projectCurrency === "USD") return [...months];

  const baseDate = implementationDate || new Date();
  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth() + 1;

  const rates = await prisma.fecExchangeRate.findMany({
    where: { currency: projectCurrency },
  });

  const rateLookup: Record<string, number> = {};
  for (const r of rates) {
    rateLookup[`${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`] = r.rateToUsd;
  }

  return months.map((val, i) => {
    const totalMonths = (startYear * 12 + startMonth - 1) + i;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const rate = rateLookup[key];
    if (rate && val !== 0) {
      return Math.round(val * rate * 100) / 100;
    }
    if (val !== 0 && rates.length > 0) {
      const sorted = [...rates].sort(
        (a, b) => (b.periodYear * 100 + b.periodMonth) - (a.periodYear * 100 + a.periodMonth)
      );
      return Math.round(val * sorted[0].rateToUsd * 100) / 100;
    }
    return 0;
  });
}

async function getUserFecRoles(email: string) {
  const employee = await prisma.employee.findFirst({
    where: { email },
  });
  if (!employee) return { isAnalyst: false, areaIds: [] as string[] };

  const assignments = await prisma.fecRoleAssignment.findMany({
    where: { employeeId: employee.id },
  });

  const isAnalyst = assignments.some(
    (a: { role: string }) => a.role === "ANALISTA_FINANCIERO"
  );
  const areaIds = assignments
    .filter((a: { role: string; areaId: string | null }) => a.role === "RESPONSABLE_AREA" && a.areaId)
    .map((a: { areaId: string | null }) => a.areaId as string);

  return { isAnalyst, areaIds, employeeId: employee.id, employeeName: employee.fullName };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const idea = await prisma.fecIdea.findUnique({
      where: { id },
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!idea) {
      return NextResponse.json(
        { error: "Idea FEC no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(idea);
  } catch (error) {
    console.error("[FEC_IDEAS] ERROR GET ID:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const idea = await prisma.fecIdea.findUnique({
      where: { id },
      include: { area: true },
    });

    if (!idea) {
      return NextResponse.json(
        { error: "Idea FEC no encontrada" },
        { status: 404 }
      );
    }

    const { isAnalyst, areaIds } = await getUserFecRoles(session.email);
    const isAdmin = session.role === "ADMINISTRADOR";

    // Permission check: analyst can edit any, area user only their area
    if (!isAnalyst && !isAdmin) {
      const hasAreaAccess = areaIds.includes(idea.areaId);
      if (!hasAreaAccess) {
        return NextResponse.json(
          { error: "No tiene permisos para editar ideas de esta área" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Handle simple field updates
    const simpleFields = [
      "title",
      "description",
      "plLine",
      "bsLine",
      "cfLine",
      "leadEmployeeId",
      "areaId",
      "companyId",
      "projectCurrency",
      "revisedImplementationDate",
    ];

    for (const field of simpleFields) {
      if (body[field] !== undefined) {
        if (field === "revisedImplementationDate") {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    // implementationDate: only analyst can change after initial save
    if (body.implementationDate !== undefined) {
      if (idea.implementationDate && !isAnalyst && !isAdmin) {
        return NextResponse.json(
          { error: "Solo el analista financiero puede modificar la fecha de implementación después del registro inicial" },
          { status: 403 }
        );
      }
      updateData.implementationDate = body.implementationDate
        ? new Date(body.implementationDate)
        : null;
    }

    // Handle local currency month values
    const hasMonthUpdates = Array.from({ length: 12 }, (_, i) => `month${i + 1}Value`).some(
      (key) => body[key] !== undefined
    );

    if (hasMonthUpdates) {
      const months = Array.from({ length: 12 }, (_, i) => {
        const key = `month${i + 1}Value`;
        const val = body[key] !== undefined ? body[key] : (idea as Record<string, unknown>)[key];
        return typeof val === "number" ? val : 0;
      });

      // For USO type, ensure negative values
      const ideaType = body.ideaType || idea.ideaType;
      const adjustedMonths =
        ideaType === "USO"
          ? months.map((v) => (v > 0 ? -Math.abs(v) : v))
          : months;

      for (let i = 0; i < 12; i++) {
        updateData[`month${i + 1}Value`] = adjustedMonths[i];
      }

      const { effectiveValue, annualizedValue } =
        calculateValues(adjustedMonths);
      updateData.effectiveValue = effectiveValue;
      updateData.annualizedValue = annualizedValue;
    }

    // Auto-calculate USD from exchange rates when local months change
    if (hasMonthUpdates || body.projectCurrency !== undefined || body.implementationDate !== undefined) {
      const finalMonths = Array.from({ length: 12 }, (_, i) => {
        const key = `month${i + 1}Value`;
        return (updateData[key] !== undefined ? updateData[key] : (idea as Record<string, unknown>)[key]) as number || 0;
      });

      const currency = (updateData.projectCurrency || idea.projectCurrency) as string;
      const implDate = updateData.implementationDate !== undefined
        ? (updateData.implementationDate as Date | null)
        : idea.implementationDate;

      const monthsUsd = await convertToUsd(finalMonths, currency, implDate);

      for (let i = 0; i < 12; i++) {
        updateData[`month${i + 1}Usd`] = monthsUsd[i];
      }

      const { effectiveValue: effectiveValueUsd, annualizedValue: annualizedValueUsd } =
        calculateValues(monthsUsd);
      updateData.effectiveValueUsd = effectiveValueUsd;
      updateData.annualizedValueUsd = annualizedValueUsd;
    }

    // Handle status change
    if (body.status && body.status !== idea.status) {
      const validStatuses = [
        "ESTUDIAR",
        "FIRME",
        "IMPLEMENTADA",
        "CANCELADA",
        "SUSPENDIDA",
      ];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Estado inválido. Estados válidos: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      // Transition to IMPLEMENTADA requires analyst
      if (body.status === "IMPLEMENTADA") {
        if (!isAnalyst && !isAdmin) {
          return NextResponse.json(
            { error: "Solo el analista financiero puede aprobar la transición a IMPLEMENTADA" },
            { status: 403 }
          );
        }

        // Check 30-day rule
        const implDate =
          body.implementationDate
            ? new Date(body.implementationDate)
            : idea.implementationDate;

        if (implDate) {
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
          if (implDate > thirtyDaysFromNow) {
            return NextResponse.json(
              { error: "No se puede marcar como IMPLEMENTADA si la fecha de implementación es más de 30 días en el futuro" },
              { status: 400 }
            );
          }
        }
      }

      // Changing status of IMPLEMENTADA idea requires analyst
      if (idea.status === "IMPLEMENTADA" && !isAnalyst && !isAdmin) {
        return NextResponse.json(
          { error: "Solo el analista financiero puede cambiar el estado de una idea IMPLEMENTADA" },
          { status: 403 }
        );
      }

      updateData.status = body.status;

      // Track cancellation/suspension metadata
      if (body.status === "CANCELADA") {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = body.cancelReason || null;
      }
      if (body.status === "SUSPENDIDA") {
        updateData.suspendedAt = new Date();
        updateData.suspendReason = body.suspendReason || null;
      }

      // Get changer name
      const changer = await prisma.employee.findFirst({
        where: { email: session.email },
      });

      // Create status history entry
      await prisma.fecStatusHistory.create({
        data: {
          ideaId: id,
          fromStatus: idea.status,
          toStatus: body.status,
          changedByEmail: session.email,
          changedByName: changer?.fullName || session.email,
          reason: body.statusChangeReason || body.cancelReason || body.suspendReason || null,
        },
      });
    }

    const updated = await prisma.fecIdea.update({
      where: { id },
      data: updateData,
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    console.log(`[FEC_IDEAS] ACTUALIZADA: ${updated.code} - ${updated.title}`);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[FEC_IDEAS] ERROR PATCH:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
