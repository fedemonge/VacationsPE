import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const configs = await prisma.systemConfiguration.findMany({
    orderBy: { key: "asc" },
  });
  return NextResponse.json({ configs });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "Clave y valor son obligatorios" },
        { status: 400 }
      );
    }

    const config = await prisma.systemConfiguration.update({
      where: { key },
      data: { value, updatedBy: "admin" },
    });

    console.log(`[CONFIG] ACTUALIZADO: ${key} = ${value}`);

    return NextResponse.json(config);
  } catch (error) {
    console.error("[CONFIG] ERROR:", error);
    return NextResponse.json(
      { error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}
