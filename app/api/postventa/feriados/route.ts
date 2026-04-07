import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { seedHolidays } from "@/lib/postventa/seed-holidays";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Seed holidays if empty
  await seedHolidays(prisma);

  const feriados = await prisma.postventaFeriado.findMany({
    where: { pais: "PERU" },
    orderBy: { fecha: "asc" },
  });

  return NextResponse.json({ feriados });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const feriado = await prisma.postventaFeriado.create({
      data: {
        fecha: new Date(body.fecha + "T00:00:00.000Z"),
        nombre: body.nombre,
        pais: body.pais || "PERU",
        isActive: true,
      },
    });
    return NextResponse.json({ feriado });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Ya existe un feriado para esa fecha" }, { status: 409 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
