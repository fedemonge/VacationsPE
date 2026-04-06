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

  const configs = await prisma.rutaConfig.findMany({
    orderBy: { key: "asc" },
  });

  const configMap: Record<string, string> = {};
  for (const c of configs) {
    configMap[c.key] = c.value;
  }

  return NextResponse.json(configMap);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const body = await req.json();
  const configs: { key: string; value: string }[] = body.configs;

  if (!Array.isArray(configs)) {
    return NextResponse.json({ error: "Se requiere un array de configs" }, { status: 400 });
  }

  for (const { key, value } of configs) {
    await prisma.rutaConfig.upsert({
      where: { key },
      update: { value, updatedBy: session.email, updatedAt: new Date() },
      create: {
        key,
        value,
        updatedBy: session.email,
        updatedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
