import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/planilla/turnos — List all shifts
export async function GET() {
  const shifts = await prisma.workShift.findMany({
    orderBy: { code: "asc" },
  });
  return NextResponse.json(shifts);
}

// POST /api/planilla/turnos — Create or update a shift
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { code, name, startTime, endTime, breakMinutes = 0, effectiveHours } = body;

  if (!code || !name || !startTime || !endTime) {
    return NextResponse.json({ error: "Campos requeridos: code, name, startTime, endTime" }, { status: 400 });
  }

  // Auto-calculate effectiveHours if not provided
  const calcEffective = effectiveHours ?? calculateEffectiveHours(startTime, endTime, breakMinutes);

  try {
    const shift = await prisma.workShift.upsert({
      where: { code },
      create: {
        code,
        name,
        startTime,
        endTime,
        breakMinutes,
        effectiveHours: calcEffective,
      },
      update: {
        name,
        startTime,
        endTime,
        breakMinutes,
        effectiveHours: calcEffective,
      },
    });
    console.log(`[TURNOS] Upserted shift: ${shift.code} - ${shift.name}`);
    return NextResponse.json(shift);
  } catch (err) {
    console.error("[TURNOS] Error:", err);
    return NextResponse.json({ error: "Error al guardar turno" }, { status: 500 });
  }
}

// DELETE /api/planilla/turnos — Delete a shift by code (query param)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Falta parámetro code" }, { status: 400 });

  try {
    // Check if any employees are assigned to this shift
    const count = await prisma.employee.count({
      where: { shift: { code } },
    });
    if (count > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: ${count} empleado(s) asignado(s) a este turno` },
        { status: 400 }
      );
    }

    await prisma.workShift.delete({ where: { code } });
    console.log(`[TURNOS] Deleted shift: ${code}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TURNOS] Delete error:", err);
    return NextResponse.json({ error: "Error al eliminar turno" }, { status: 500 });
  }
}

function calculateEffectiveHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // overnight
  return Math.round(((totalMinutes - breakMin) / 60) * 100) / 100;
}
