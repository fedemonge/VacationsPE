import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const calendars = await prisma.mrpWorkingCalendar.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    return NextResponse.json(calendars);
  } catch (error) {
    console.error("[MRP] Calendar GET error:", error);
    return NextResponse.json({ error: "Error al obtener calendario" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const items = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Se requiere un arreglo de datos de calendario" }, { status: 400 });
    }

    const results = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { month, year, workingDays } = item;

      if (!month || !year || workingDays == null) {
        errors.push(`Elemento ${i + 1}: mes, año y días laborales son requeridos`);
        continue;
      }

      if (month < 1 || month > 12) {
        errors.push(`Elemento ${i + 1}: mes inválido (1-12)`);
        continue;
      }

      if (workingDays < 0 || workingDays > 31) {
        errors.push(`Elemento ${i + 1}: días laborales inválidos (0-31)`);
        continue;
      }

      try {
        const result = await prisma.mrpWorkingCalendar.upsert({
          where: { month_year: { month, year } },
          create: { month, year, workingDays },
          update: { workingDays },
        });
        results.push(result);
      } catch (e) {
        errors.push(`Elemento ${i + 1}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ updated: results.length, errors });
  } catch (error) {
    console.error("[MRP] Calendar PUT error:", error);
    return NextResponse.json({ error: "Error al actualizar calendario" }, { status: 500 });
  }
}
