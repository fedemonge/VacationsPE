import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"].includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};
  if (year) {
    where.validFrom = { lte: new Date(`${year}-12-31`) };
  }

  const params = await prisma.payrollLegalParam.findMany({
    where,
    orderBy: [{ paramKey: "asc" }, { validFrom: "desc" }],
  });

  return NextResponse.json(params);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { paramKey, paramValue, validFrom, validTo, description } = body;

  if (!paramKey || paramValue === undefined || !validFrom) {
    return NextResponse.json({ error: "paramKey, paramValue y validFrom son requeridos" }, { status: 400 });
  }

  const param = await prisma.payrollLegalParam.upsert({
    where: {
      paramKey_validFrom: {
        paramKey,
        validFrom: new Date(validFrom),
      },
    },
    update: {
      paramValue: parseFloat(paramValue),
      validTo: validTo ? new Date(validTo) : null,
      description: description || null,
    },
    create: {
      paramKey,
      paramValue: parseFloat(paramValue),
      validFrom: new Date(validFrom),
      validTo: validTo ? new Date(validTo) : null,
      description: description || null,
    },
  });

  console.log(`[PLANILLA] PARAMETRO: ${paramKey}=${paramValue} desde ${validFrom}`);
  return NextResponse.json(param, { status: 201 });
}
