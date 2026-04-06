import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;
  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get("page") || "1");
  const limit = parseInt(sp.get("limit") || "50");
  const skip = (page - 1) * limit;

  const [importRecord, records, total] = await Promise.all([
    prisma.scoreAgendaImport.findUnique({ where: { id } }),
    prisma.scoreAgendaRecord.findMany({
      where: { importId: id },
      skip,
      take: limit,
      orderBy: { fechaAgenda: "asc" },
    }),
    prisma.scoreAgendaRecord.count({ where: { importId: id } }),
  ]);

  if (!importRecord) {
    return NextResponse.json({ error: "Importación no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    import: importRecord,
    records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureRecuperoTables();

  const { id } = params;

  await prisma.scoreAgendaImport.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
