import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const companies = await prisma.fecCompany.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error("[FEC_COMPANIES] ERROR GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    if (session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo administradores pueden crear empresas" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, code, currency, country } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: "name y code son obligatorios" },
        { status: 400 }
      );
    }

    const company = await prisma.fecCompany.create({
      data: {
        name,
        code,
        currency: currency || "USD",
        country: country || null,
      },
    });

    console.log(`[FEC_COMPANIES] CREADA: ${company.code} - ${company.name}`);

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("[FEC_COMPANIES] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
