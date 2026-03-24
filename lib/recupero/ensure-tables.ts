import { prisma } from "@/lib/prisma";

let tablesChecked = false;

/**
 * Ensure Recupero tables exist in the database.
 * Runs once per server lifecycle via the `tablesChecked` flag.
 */
export async function ensureRecuperoTables() {
  if (tablesChecked) return;

  try {
    // Quick check: try to count rows. If the table doesn't exist, this throws.
    await prisma.$queryRawUnsafe(`SELECT count(*) as c FROM RecuperoImport LIMIT 1`);
    tablesChecked = true;
    return;
  } catch {
    // Table doesn't exist — create all Recupero tables
    console.log("[RECUPERO] Creating missing Recupero tables...");
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RecuperoImport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "fileName" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'MANUAL',
        "totalRows" INTEGER NOT NULL DEFAULT 0,
        "importedRows" INTEGER NOT NULL DEFAULT 0,
        "errorRows" INTEGER NOT NULL DEFAULT 0,
        "importedByEmail" TEXT,
        "importedByName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RecuperoImport_createdAt_idx" ON "RecuperoImport"("createdAt")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RecuperoTask" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "importId" TEXT NOT NULL,
        "externalId" TEXT,
        "contrato" TEXT,
        "grupo" TEXT,
        "documentoId" TEXT,
        "agenteCampo" TEXT NOT NULL,
        "cedulaUsuario" TEXT,
        "nombreUsuario" TEXT,
        "direccion" TEXT,
        "ciudad" TEXT,
        "departamento" TEXT,
        "latitud" REAL,
        "longitud" REAL,
        "tarea" TEXT,
        "fechaCierre" DATETIME,
        "estado" TEXT,
        "latitudCierre" REAL,
        "longitudCierre" REAL,
        "tipoCierre" TEXT,
        "tipoBase" TEXT,
        "distanciaMetros" REAL,
        "esQuemada" BOOLEAN NOT NULL DEFAULT false,
        "esAgendado" BOOLEAN NOT NULL DEFAULT true,
        "coordStatus" TEXT NOT NULL DEFAULT 'VALID',
        "latitudExtraida" REAL,
        "longitudExtraida" REAL,
        "periodoYear" INTEGER NOT NULL,
        "periodoMonth" INTEGER NOT NULL,
        "periodoDay" INTEGER NOT NULL DEFAULT 1,
        "equiposRecuperados" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RecuperoTask_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RecuperoImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_importId_idx" ON "RecuperoTask"("importId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_agenteCampo_idx" ON "RecuperoTask"("agenteCampo")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_estado_idx" ON "RecuperoTask"("estado")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_tipoBase_idx" ON "RecuperoTask"("tipoBase")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_periodoYear_periodoMonth_idx" ON "RecuperoTask"("periodoYear", "periodoMonth")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_esQuemada_idx" ON "RecuperoTask"("esQuemada")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_esAgendado_idx" ON "RecuperoTask"("esAgendado")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_coordStatus_idx" ON "RecuperoTask"("coordStatus")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoTask_tipoCierre_idx" ON "RecuperoTask"("tipoCierre")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RecuperoEquipo" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "taskId" TEXT NOT NULL,
        "serial" TEXT,
        "serialAdicional" TEXT,
        "tarjetas" BOOLEAN NOT NULL DEFAULT false,
        "controles" BOOLEAN NOT NULL DEFAULT false,
        "fuentes" BOOLEAN NOT NULL DEFAULT false,
        "cablePoder" BOOLEAN NOT NULL DEFAULT false,
        "cableFibra" BOOLEAN NOT NULL DEFAULT false,
        "cableHdmi" BOOLEAN NOT NULL DEFAULT false,
        "cablesRca" BOOLEAN NOT NULL DEFAULT false,
        "cablesRj11" BOOLEAN NOT NULL DEFAULT false,
        "cablesRj45" BOOLEAN NOT NULL DEFAULT false,
        "gestionExitosa" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RecuperoEquipo_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RecuperoTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RecuperoEquipo_taskId_idx" ON "RecuperoEquipo"("taskId")`);

    console.log("[RECUPERO] All Recupero tables created successfully.");
    tablesChecked = true;
  } catch (err) {
    console.error("[RECUPERO] Failed to create tables:", err);
    throw err;
  }
}
