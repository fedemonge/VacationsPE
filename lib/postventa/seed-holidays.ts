import { PrismaClient } from "@prisma/client";

const PERUVIAN_HOLIDAYS: { fecha: string; nombre: string }[] = [
  // 2025
  { fecha: "2025-01-01", nombre: "Año Nuevo" },
  { fecha: "2025-04-17", nombre: "Jueves Santo" },
  { fecha: "2025-04-18", nombre: "Viernes Santo" },
  { fecha: "2025-05-01", nombre: "Día del Trabajo" },
  { fecha: "2025-06-07", nombre: "Batalla de Arica" },
  { fecha: "2025-06-29", nombre: "San Pedro y San Pablo" },
  { fecha: "2025-07-23", nombre: "Día de la Fuerza Aérea" },
  { fecha: "2025-07-28", nombre: "Fiestas Patrias" },
  { fecha: "2025-07-29", nombre: "Fiestas Patrias" },
  { fecha: "2025-08-06", nombre: "Batalla de Junín" },
  { fecha: "2025-08-30", nombre: "Santa Rosa de Lima" },
  { fecha: "2025-10-08", nombre: "Combate de Angamos" },
  { fecha: "2025-11-01", nombre: "Todos los Santos" },
  { fecha: "2025-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2025-12-09", nombre: "Batalla de Ayacucho" },
  { fecha: "2025-12-25", nombre: "Navidad" },
  // 2026
  { fecha: "2026-01-01", nombre: "Año Nuevo" },
  { fecha: "2026-04-02", nombre: "Jueves Santo" },
  { fecha: "2026-04-03", nombre: "Viernes Santo" },
  { fecha: "2026-05-01", nombre: "Día del Trabajo" },
  { fecha: "2026-06-07", nombre: "Batalla de Arica" },
  { fecha: "2026-06-29", nombre: "San Pedro y San Pablo" },
  { fecha: "2026-07-23", nombre: "Día de la Fuerza Aérea" },
  { fecha: "2026-07-28", nombre: "Fiestas Patrias" },
  { fecha: "2026-07-29", nombre: "Fiestas Patrias" },
  { fecha: "2026-08-06", nombre: "Batalla de Junín" },
  { fecha: "2026-08-30", nombre: "Santa Rosa de Lima" },
  { fecha: "2026-10-08", nombre: "Combate de Angamos" },
  { fecha: "2026-11-01", nombre: "Todos los Santos" },
  { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2026-12-09", nombre: "Batalla de Ayacucho" },
  { fecha: "2026-12-25", nombre: "Navidad" },
  // 2027
  { fecha: "2027-01-01", nombre: "Año Nuevo" },
  { fecha: "2027-03-25", nombre: "Jueves Santo" },
  { fecha: "2027-03-26", nombre: "Viernes Santo" },
  { fecha: "2027-05-01", nombre: "Día del Trabajo" },
  { fecha: "2027-06-07", nombre: "Batalla de Arica" },
  { fecha: "2027-06-29", nombre: "San Pedro y San Pablo" },
  { fecha: "2027-07-23", nombre: "Día de la Fuerza Aérea" },
  { fecha: "2027-07-28", nombre: "Fiestas Patrias" },
  { fecha: "2027-07-29", nombre: "Fiestas Patrias" },
  { fecha: "2027-08-06", nombre: "Batalla de Junín" },
  { fecha: "2027-08-30", nombre: "Santa Rosa de Lima" },
  { fecha: "2027-10-08", nombre: "Combate de Angamos" },
  { fecha: "2027-11-01", nombre: "Todos los Santos" },
  { fecha: "2027-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2027-12-09", nombre: "Batalla de Ayacucho" },
  { fecha: "2027-12-25", nombre: "Navidad" },
];

export async function seedHolidays(prisma: PrismaClient) {
  const existing = await prisma.postventaFeriado.count();
  if (existing > 0) return { seeded: 0, message: "Holidays already seeded" };

  let seeded = 0;
  for (const h of PERUVIAN_HOLIDAYS) {
    try {
      await prisma.postventaFeriado.create({
        data: {
          fecha: new Date(h.fecha + "T00:00:00.000Z"),
          nombre: h.nombre,
          pais: "PERU",
          isActive: true,
        },
      });
      seeded++;
    } catch {
      // skip duplicates
    }
  }
  return { seeded, message: `Seeded ${seeded} Peruvian holidays (2025-2027)` };
}
