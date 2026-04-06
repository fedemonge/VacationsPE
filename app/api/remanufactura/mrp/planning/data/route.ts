import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");

  try {
    if (type === "demand") {
      const data = await prisma.mrpDemandForecast.findMany({
        include: { equipment: { select: { id: true, code: true, name: true } } },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      return NextResponse.json(data);
    }
    if (type === "inventory") {
      const data = await prisma.mrpInventorySnapshot.findMany({
        include: { material: { select: { id: true, code: true, name: true, unitOfMeasure: true } } },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      return NextResponse.json(data);
    }
    if (type === "recovery") {
      const data = await prisma.mrpRecoveryForecast.findMany({
        include: { equipment: { select: { id: true, code: true, name: true } } },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Tipo no valido" }, { status: 400 });
  } catch (error) {
    console.error("[MRP] Data fetch error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { type, id, ...fields } = await req.json();
    if (!type || !id) return NextResponse.json({ error: "type e id son requeridos" }, { status: 400 });

    if (type === "demand") {
      const updated = await prisma.mrpDemandForecast.update({
        where: { id },
        data: {
          ...(fields.month !== undefined && { month: Number(fields.month) }),
          ...(fields.year !== undefined && { year: Number(fields.year) }),
          ...(fields.quantity !== undefined && { quantity: Number(fields.quantity) }),
        },
      });
      return NextResponse.json(updated);
    }
    if (type === "inventory") {
      const updated = await prisma.mrpInventorySnapshot.update({
        where: { id },
        data: {
          ...(fields.month !== undefined && { month: Number(fields.month) }),
          ...(fields.year !== undefined && { year: Number(fields.year) }),
          ...(fields.quantityOnHand !== undefined && { quantityOnHand: Number(fields.quantityOnHand) }),
        },
      });
      return NextResponse.json(updated);
    }
    if (type === "recovery") {
      const updated = await prisma.mrpRecoveryForecast.update({
        where: { id },
        data: {
          ...(fields.month !== undefined && { month: Number(fields.month) }),
          ...(fields.year !== undefined && { year: Number(fields.year) }),
          ...(fields.incomingUnits !== undefined && { incomingUnits: Number(fields.incomingUnits) }),
        },
      });
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Tipo no valido" }, { status: 400 });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("[MRP] Data update error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const type = req.nextUrl.searchParams.get("type");
    const id = req.nextUrl.searchParams.get("id");
    if (!type || !id) return NextResponse.json({ error: "type e id son requeridos" }, { status: 400 });

    if (type === "demand") {
      await prisma.mrpDemandForecast.delete({ where: { id } });
    } else if (type === "inventory") {
      await prisma.mrpInventorySnapshot.delete({ where: { id } });
    } else if (type === "recovery") {
      await prisma.mrpRecoveryForecast.delete({ where: { id } });
    } else {
      return NextResponse.json({ error: "Tipo no valido" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("[MRP] Data delete error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
