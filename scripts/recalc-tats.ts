import { PrismaClient } from "@prisma/client";
import { calculateSubProcessTats } from "../lib/postventa/tat-engine";

const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.postventaTatConfig.findMany({ where: { isActive: true } });
  const configMap = new Map(configs.map((c) => [c.segmento, c]));
  const holidays = await prisma.postventaFeriado.findMany({ where: { isActive: true, pais: "PERU" } });
  const holidayDates = holidays.map((h) => new Date(h.fecha));

  const total = await prisma.postventaOrden.count();
  console.log(`Total orders: ${total}`);
  let processed = 0;
  const BATCH = 500;

  for (let skip = 0; skip < total; skip += BATCH) {
    const batch = await prisma.postventaOrden.findMany({
      skip,
      take: BATCH,
      select: {
        id: true, segmento: true,
        ingreso: true, envio: true, diagnostico: true, reparacion: true,
        calidad: true, retorno: true, entrega: true,
        fechaIrreparable: true, fechaDevolucion: true, fechaEscalado: true,
        fechaCotizado: true, fechaFinanciamiento: true, fechaPendiente: true,
        targetTatGarantias: true,
      },
    });
    for (const orden of batch) {
      const config = configMap.get(orden.segmento || "");
      const opts = {
        includeSaturdays: config?.consideraSabados ?? false,
        includeSundays: config?.consideraDomingos ?? false,
        includeHolidays: config?.consideraFeriados ?? false,
        holidays: holidayDates,
      };
      const targets = {
        garantia: config?.tatMaximoGarantia ?? orden.targetTatGarantias ?? 5,
        woden: config?.tatObjetivoWoden ?? 3,
        lab: config?.tatObjetivoLab ?? 1,
      };
      const tats = calculateSubProcessTats(orden, opts, targets);
      await prisma.postventaOrden.update({ where: { id: orden.id }, data: tats });
      processed++;
    }
    console.log(`Processed ${processed} / ${total}`);
  }
  console.log(`Done: ${processed} orders recalculated`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
