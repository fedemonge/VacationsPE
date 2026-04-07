import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const configs = await prisma.postventaTatConfig.findMany({
    orderBy: { segmento: "asc" },
  });

  return NextResponse.json({ configs });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const config = await prisma.postventaTatConfig.create({
      data: {
        segmento: body.segmento,
        tatMaximoGarantia: body.tatMaximoGarantia ?? 5,
        tatObjetivoWoden: body.tatObjetivoWoden ?? 3,
        tatObjetivoLab: body.tatObjetivoLab ?? 1,
        consideraSabados: body.consideraSabados ?? false,
        consideraDomingos: body.consideraDomingos ?? false,
        consideraFeriados: body.consideraFeriados ?? false,
      },
    });
    return NextResponse.json({ config });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...data } = body;
    const config = await prisma.postventaTatConfig.update({
      where: { id },
      data,
    });
    return NextResponse.json({ config });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
