import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const configs = await prisma.rutaExportConfig.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    configs.map((c) => ({
      ...c,
      fieldOrder: JSON.parse(c.fieldOrder),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const body = await req.json();
  const { name, fieldOrder, delimiter } = body;

  if (!name || !Array.isArray(fieldOrder)) {
    return NextResponse.json(
      { error: "Se requiere name y fieldOrder (array)" },
      { status: 400 }
    );
  }

  const config = await prisma.rutaExportConfig.create({
    data: {
      name: name.trim(),
      fieldOrder: JSON.stringify(fieldOrder),
      delimiter: delimiter || ",",
    },
  });

  return NextResponse.json({
    ...config,
    fieldOrder: JSON.parse(config.fieldOrder),
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const body = await req.json();
  const { id, name, fieldOrder, delimiter, isDefault } = body;

  if (!id) {
    return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (fieldOrder !== undefined) data.fieldOrder = JSON.stringify(fieldOrder);
  if (delimiter !== undefined) data.delimiter = delimiter;
  if (isDefault !== undefined) data.isDefault = Boolean(isDefault);

  const config = await prisma.rutaExportConfig.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    ...config,
    fieldOrder: JSON.parse(config.fieldOrder),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id) {
    return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
  }

  await prisma.rutaExportConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
