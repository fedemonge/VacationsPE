import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ordenes = await prisma.postventaOrden.findMany({
    select: {
      segmento: true,
      marca: true,
      ciudadHomologada: true,
      tipoDeZona: true,
      estadoOrden: true,
      estadoOperativo: true,
      cierreOdsxEstado: true,
      gestionable: true,
      pais: true,
      condicionCalculada: true,
      anoIng: true,
      mesIng: true,
    },
  });

  const unique = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter((v): v is string => !!v))).sort();

  const uniqueNums = (arr: (number | null | undefined)[]) =>
    Array.from(new Set(arr.filter((v): v is number => v !== null && v !== undefined))).sort((a, b) => b - a);

  return NextResponse.json({
    segmentos: unique(ordenes.map((o) => o.segmento)),
    marcas: unique(ordenes.map((o) => o.marca)),
    ciudades: unique(ordenes.map((o) => o.ciudadHomologada)),
    zonas: unique(ordenes.map((o) => o.tipoDeZona)),
    estadosOrden: unique(ordenes.map((o) => o.estadoOrden)),
    cierresOds: unique(ordenes.map((o) => o.cierreOdsxEstado)),
    estadosOperativos: unique(ordenes.map((o) => o.estadoOperativo)),
    gestionables: unique(ordenes.map((o) => o.gestionable)),
    paises: unique(ordenes.map((o) => o.pais)),
    condiciones: unique(ordenes.map((o) => o.condicionCalculada)),
    anos: uniqueNums(ordenes.map((o) => o.anoIng)),
    meses: uniqueNums(ordenes.map((o) => o.mesIng)),
  });
}
