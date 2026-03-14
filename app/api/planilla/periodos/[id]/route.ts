import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      details: {
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, email: true, costCenter: true, costCenterDesc: true } },
          lines: { orderBy: { displayOrder: "asc" } },
        },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(period);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }

  if (body.action === "CERRAR") {
    if (period.status !== "CALCULADO") {
      return NextResponse.json({ error: "Solo se puede cerrar un periodo CALCULADO" }, { status: 400 });
    }
    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data: { status: "CERRADO", closedAt: new Date(), closedBy: session.email },
    });
    console.log(`[PLANILLA] PERIODO CERRADO: ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} por ${session.email}`);
    return NextResponse.json(updated);
  }

  const data: Record<string, unknown> = {};
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.paymentDate !== undefined) data.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;

  const updated = await prisma.payrollPeriod.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: { details: { select: { id: true } } },
  });

  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }

  if (period.status === "CERRADO") {
    return NextResponse.json({ error: "No se puede eliminar un periodo cerrado" }, { status: 400 });
  }

  if (period.details.length > 0) {
    // Delete all detail lines first, then details
    await prisma.payrollDetailLine.deleteMany({
      where: { detail: { periodId: id } },
    });
    await prisma.payrollDetail.deleteMany({ where: { periodId: id } });
  }

  await prisma.payrollPeriod.delete({ where: { id } });
  console.log(`[PLANILLA] PERIODO ELIMINADO: ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")}`);
  return NextResponse.json({ success: true });
}
