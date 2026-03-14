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

  const detail = await prisma.payrollDetail.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, email: true, costCenter: true, costCenterDesc: true } },
      period: true,
      lines: { orderBy: { displayOrder: "asc" } },
    },
  });

  if (!detail) {
    return NextResponse.json({ error: "Detalle no encontrado" }, { status: 404 });
  }

  return NextResponse.json(detail);
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

  const detail = await prisma.payrollDetail.findUnique({
    where: { id },
    include: { period: true },
  });

  if (!detail) {
    return NextResponse.json({ error: "Detalle no encontrado" }, { status: 404 });
  }

  if (detail.period.status === "CERRADO") {
    return NextResponse.json({ error: "No se puede eliminar en periodo cerrado" }, { status: 400 });
  }

  await prisma.payrollDetailLine.deleteMany({ where: { detailId: id } });
  await prisma.payrollDetail.delete({ where: { id } });

  console.log(`[PLANILLA] DETALLE ELIMINADO: ${id}`);
  return NextResponse.json({ success: true });
}
