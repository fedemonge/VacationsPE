import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const year = sp.get("year") ? parseInt(sp.get("year")!) : undefined;
  const month = sp.get("month") ? parseInt(sp.get("month")!) : undefined;

  const where: Record<string, unknown> = {};
  if (year) where.periodoYear = year;
  if (month) where.periodoMonth = month;

  const [agentesRaw, tiposRaw, gruposRaw, tiposCierreRaw] = await Promise.all([
    prisma.recuperoTask.groupBy({
      by: ["agenteCampo"],
      where,
      orderBy: { agenteCampo: "asc" },
    }),
    prisma.recuperoTask.groupBy({
      by: ["tipoBase"],
      where: { ...where, tipoBase: { not: null } },
      orderBy: { tipoBase: "asc" },
    }),
    prisma.recuperoTask.groupBy({
      by: ["grupo"],
      where: { ...where, grupo: { not: null } },
      orderBy: { grupo: "asc" },
    }),
    prisma.recuperoTask.groupBy({
      by: ["tipoCierre"],
      where: { ...where, tipoCierre: { not: null } },
      orderBy: { tipoCierre: "asc" },
    }),
  ]);

  return NextResponse.json({
    agentes: agentesRaw.map((a) => a.agenteCampo),
    tiposBase: tiposRaw.map((t) => t.tipoBase).filter(Boolean),
    grupos: gruposRaw.map((g) => g.grupo).filter(Boolean),
    tiposCierre: tiposCierreRaw.map((t) => t.tipoCierre).filter(Boolean),
    hasAgendado: true,
  });
}
