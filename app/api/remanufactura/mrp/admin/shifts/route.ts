import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const shifts = await prisma.mrpShiftConfig.findMany();
    return NextResponse.json(shifts);
  } catch (error) {
    console.error("[MRP] Shifts GET error:", error);
    return NextResponse.json({ error: "Error al obtener turnos" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const items = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Se requiere un arreglo de configuración de turnos" }, { status: 400 });
    }

    const results = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { id, name, startTime, endTime, costMultiplier, isActive } = item;

      if (!name || !startTime || !endTime) {
        errors.push(`Elemento ${i + 1}: nombre, hora inicio y hora fin son requeridos`);
        continue;
      }

      // Validate time format (HH:MM)
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        errors.push(`Elemento ${i + 1}: formato de hora inválido (use HH:MM)`);
        continue;
      }

      try {
        if (id) {
          // Update existing shift
          const result = await prisma.mrpShiftConfig.update({
            where: { id },
            data: {
              name,
              startTime,
              endTime,
              costMultiplier: costMultiplier ?? 1.0,
              isActive: isActive ?? true,
            },
          });
          results.push(result);
        } else {
          // Create new shift
          const result = await prisma.mrpShiftConfig.create({
            data: {
              name,
              startTime,
              endTime,
              costMultiplier: costMultiplier ?? 1.0,
              isActive: isActive ?? true,
            },
          });
          results.push(result);
        }
      } catch (e) {
        errors.push(`Elemento ${i + 1}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ updated: results.length, shifts: results, errors });
  } catch (error) {
    console.error("[MRP] Shifts PUT error:", error);
    return NextResponse.json({ error: "Error al actualizar turnos" }, { status: 500 });
  }
}
