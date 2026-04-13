import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const skip = (page - 1) * limit;

  // Build where clause from filters
  const where: Record<string, unknown> = {};

  const anoIng = searchParams.get("anoIng");
  const mesIng = searchParams.get("mesIng");
  if (anoIng) where.anoIng = parseInt(anoIng, 10);
  if (mesIng) where.mesIng = parseInt(mesIng, 10);

  const segmento = searchParams.get("segmento");
  if (segmento) where.segmento = segmento;

  const marca = searchParams.get("marca");
  if (marca) where.marca = marca;

  const estadoOrden = searchParams.get("estadoOrden");
  if (estadoOrden) where.estadoOrden = estadoOrden;

  const estadoOperativo = searchParams.get("estadoOperativo");
  if (estadoOperativo) where.estadoOperativo = estadoOperativo;

  const gestionable = searchParams.get("gestionable");
  if (gestionable) where.gestionable = gestionable;

  const ciudadHomologada = searchParams.get("ciudadHomologada");
  if (ciudadHomologada) where.ciudadHomologada = ciudadHomologada;

  const tipoDeZona = searchParams.get("tipoDeZona");
  if (tipoDeZona) where.tipoDeZona = tipoDeZona;

  const condicionCalculada = searchParams.get("condicionCalculada");
  if (condicionCalculada) where.condicionCalculada = condicionCalculada;
  const cierreOdsxEstado = searchParams.get("cierreOdsxEstado");
  if (cierreOdsxEstado) where.cierreOdsxEstado = cierreOdsxEstado;
  const sucursal = searchParams.get("sucursal");
  if (sucursal) where.sucursal = sucursal;
  const canal = searchParams.get("canal");
  if (canal) where.canal = canal;
  const pais = searchParams.get("pais");
  if (pais) where.pais = pais;

  const [ordenes, total] = await Promise.all([
    prisma.postventaOrden.findMany({
      where,
      orderBy: { ingreso: "desc" },
      skip,
      take: limit,
    }),
    prisma.postventaOrden.count({ where }),
  ]);

  return NextResponse.json({ ordenes, total, page, limit });
}
