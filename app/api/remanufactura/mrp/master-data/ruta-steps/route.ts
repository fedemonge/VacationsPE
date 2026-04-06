import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const rutaId = searchParams.get("rutaId");
    const steps = await prisma.mrpRutaStep.findMany({
      where: rutaId ? { rutaId } : undefined,
      orderBy: { sequenceOrder: "asc" },
      include: {
        ruta: { select: { id: true, code: true, name: true } },
        subProcess: { select: { id: true, code: true, name: true } },
        childRuta: { select: { id: true, code: true, name: true, _count: { select: { steps: true } } } },
      },
    });
    return NextResponse.json(steps);
  } catch (error) {
    console.error("[MRP] GET ruta-steps error:", error);
    return NextResponse.json({ error: "Error al obtener pasos de ruta" }, { status: 500 });
  }
}

/**
 * Checks if adding childRutaId as a step of parentRutaId would create a cycle.
 * Walks the child ruta's steps recursively looking for parentRutaId.
 */
async function wouldCreateCycle(parentRutaId: string, childRutaId: string, visited: Set<string> = new Set()): Promise<boolean> {
  if (childRutaId === parentRutaId) return true;
  if (visited.has(childRutaId)) return false;
  visited.add(childRutaId);

  const childSteps = await prisma.mrpRutaStep.findMany({
    where: { rutaId: childRutaId, childRutaId: { not: null } },
    select: { childRutaId: true },
  });

  for (const step of childSteps) {
    if (step.childRutaId && await wouldCreateCycle(parentRutaId, step.childRutaId, visited)) {
      return true;
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { rutaId, subProcessId, childRutaId, sequenceOrder, laborHoursPerUnit, isParallel } = await req.json();

    if (!rutaId || sequenceOrder === undefined) {
      return NextResponse.json({ error: "rutaId y sequenceOrder son requeridos" }, { status: 400 });
    }

    // Must have either subProcessId OR childRutaId, not both, not neither
    if (!subProcessId && !childRutaId) {
      return NextResponse.json({ error: "Debe especificar un sub-proceso o una ruta hija" }, { status: 400 });
    }
    if (subProcessId && childRutaId) {
      return NextResponse.json({ error: "No puede especificar sub-proceso y ruta hija a la vez" }, { status: 400 });
    }

    // Circular reference check for child ruta
    if (childRutaId) {
      if (childRutaId === rutaId) {
        return NextResponse.json({ error: "Una ruta no puede referenciarse a sí misma" }, { status: 400 });
      }
      const cycle = await wouldCreateCycle(rutaId, childRutaId);
      if (cycle) {
        return NextResponse.json({ error: "Referencia circular detectada: la ruta hija ya contiene esta ruta" }, { status: 400 });
      }
    }

    const step = await prisma.mrpRutaStep.create({
      data: {
        rutaId,
        subProcessId: subProcessId || null,
        childRutaId: childRutaId || null,
        sequenceOrder,
        laborHoursPerUnit: subProcessId ? (laborHoursPerUnit ?? 0) : 0,
        isParallel: isParallel ?? false,
      },
    });
    return NextResponse.json(step, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2003") return NextResponse.json({ error: "Ruta, sub-proceso o ruta hija no encontrado" }, { status: 400 });
    console.error("[MRP] POST ruta-step error:", error);
    return NextResponse.json({ error: "Error al crear paso de ruta" }, { status: 500 });
  }
}
