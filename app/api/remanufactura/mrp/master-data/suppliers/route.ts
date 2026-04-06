import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const suppliers = await prisma.mrpSupplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { supplierItems: true, mainMaterials: true, backupMaterials: true } },
        mainMaterials: { select: { id: true, code: true, name: true, unitOfMeasure: true, leadTimeDays: true } },
        backupMaterials: { select: { id: true, code: true, name: true, unitOfMeasure: true, leadTimeDays: true } },
      },
    });
    // Add computed material count
    const result = suppliers.map((s) => ({
      ...s,
      materialCount: s._count.mainMaterials + s._count.backupMaterials,
    }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[MRP] GET suppliers error:", error);
    return NextResponse.json({ error: "Error al obtener proveedores" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { name, contactName, email, phone, country, currency } = await req.json();
    if (!name) return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });
    const supplier = await prisma.mrpSupplier.create({
      data: {
        name,
        contactName: contactName ?? null,
        email: email ?? null,
        phone: phone ?? null,
        country: country ?? null,
        currency: currency ?? null,
      },
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Proveedor ya existe" }, { status: 409 });
    console.error("[MRP] POST supplier error:", error);
    return NextResponse.json({ error: "Error al crear proveedor" }, { status: 500 });
  }
}
