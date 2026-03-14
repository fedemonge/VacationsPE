import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const where: Record<string, unknown> = { isActive: true };
    if (type) where.type = type;

    const lines = await prisma.fecFinancialLine.findMany({
      where,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ lines });
  } catch (error) {
    console.error("[FEC_FINANCIAL_LINES] ERROR GET:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
    }

    const body = await request.json();
    const { type, name } = body;

    if (!type || !name) {
      return NextResponse.json({ error: "type y name son obligatorios" }, { status: 400 });
    }

    if (!["PL", "BS", "CF"].includes(type)) {
      return NextResponse.json({ error: "type debe ser PL, BS o CF" }, { status: 400 });
    }

    const line = await prisma.fecFinancialLine.create({
      data: { type, name },
    });

    return NextResponse.json(line, { status: 201 });
  } catch (error) {
    console.error("[FEC_FINANCIAL_LINES] ERROR POST:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
    }

    await prisma.fecFinancialLine.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FEC_FINANCIAL_LINES] ERROR DELETE:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
