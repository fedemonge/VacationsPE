import { prisma } from "@/lib/prisma";

let tablesChecked = false;

/**
 * Ensure Recupero tables exist in the database.
 * Runs once per server lifecycle via the `tablesChecked` flag.
 */
export async function ensureRecuperoTables() {
  if (tablesChecked) return;

  try {
    // Quick check: try to count rows. If any table doesn't exist, this throws.
    await prisma.$queryRawUnsafe(`SELECT count(*) as c FROM "RecuperoImport" LIMIT 1`);
    await prisma.$queryRawUnsafe(`SELECT count(*) as c FROM "ClientDataImport" LIMIT 1`);
    tablesChecked = true;
    return;
  } catch {
    // Table doesn't exist — create all tables
    console.log("[RECUPERO] Creating missing tables...");
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

    // Client Data (Contact Center / Calidad de Datos)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ClientDataImport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "source" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "receptionDate" DATETIME NOT NULL,
        "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "totalRows" INTEGER NOT NULL DEFAULT 0,
        "validPhoneRows" INTEGER NOT NULL DEFAULT 0,
        "incompletePhoneRows" INTEGER NOT NULL DEFAULT 0,
        "invalidPhoneRows" INTEGER NOT NULL DEFAULT 0,
        "missingPhoneRows" INTEGER NOT NULL DEFAULT 0,
        "validCoordsRows" INTEGER NOT NULL DEFAULT 0,
        "coordsInPeruRows" INTEGER NOT NULL DEFAULT 0,
        "coordsOutsidePeruRows" INTEGER NOT NULL DEFAULT 0,
        "validAddressRows" INTEGER NOT NULL DEFAULT 0,
        "extractedCoordsRows" INTEGER NOT NULL DEFAULT 0,
        "importedByEmail" TEXT
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ClientDataRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "importId" TEXT NOT NULL,
        "rowNumber" INTEGER NOT NULL,
        "externalId" TEXT,
        "customerId" TEXT,
        "customerName" TEXT,
        "address" TEXT,
        "district" TEXT,
        "province" TEXT,
        "department" TEXT,
        "workOrderType" TEXT,
        "status" TEXT,
        "phone1" TEXT,
        "phone2" TEXT,
        "latitude" REAL,
        "longitude" REAL,
        "coordsSource" TEXT NOT NULL DEFAULT 'MISSING',
        "equipmentType" TEXT,
        "equipmentModel" TEXT,
        "serialNumber" TEXT,
        "technology" TEXT,
        "hasValidPhone" BOOLEAN NOT NULL DEFAULT false,
        "phoneStatus" TEXT NOT NULL DEFAULT 'MISSING',
        "hasValidCoords" BOOLEAN NOT NULL DEFAULT false,
        "coordsInPeru" BOOLEAN NOT NULL DEFAULT false,
        "coordsOutsidePeru" BOOLEAN NOT NULL DEFAULT false,
        "hasValidAddress" BOOLEAN NOT NULL DEFAULT false,
        "coordsExtracted" BOOLEAN NOT NULL DEFAULT false,
        "rawData" TEXT NOT NULL DEFAULT '{}',
        CONSTRAINT "ClientDataRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ClientDataImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClientDataRecord_importId_idx" ON "ClientDataRecord"("importId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClientDataRecord_hasValidPhone_idx" ON "ClientDataRecord"("hasValidPhone")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClientDataRecord_hasValidCoords_idx" ON "ClientDataRecord"("hasValidCoords")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClientDataRecord_hasValidAddress_idx" ON "ClientDataRecord"("hasValidAddress")`);

    // ── Route Optimization (Rutas) ──────────────────────────────────

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RutaConfig" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "updatedAt" DATETIME NOT NULL,
        "updatedBy" TEXT NOT NULL DEFAULT 'system'
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RutaConfig_key_key" ON "RutaConfig"("key")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RutaAgente" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "nombre" TEXT NOT NULL,
        "latInicio" REAL NOT NULL,
        "lonInicio" REAL NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RutaAgente_nombre_key" ON "RutaAgente"("nombre")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaAgente_isActive_idx" ON "RutaAgente"("isActive")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScoreAgendaImport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "fileName" TEXT NOT NULL,
        "totalRows" INTEGER NOT NULL DEFAULT 0,
        "importedRows" INTEGER NOT NULL DEFAULT 0,
        "errorRows" INTEGER NOT NULL DEFAULT 0,
        "importedByEmail" TEXT,
        "importedByName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaImport_createdAt_idx" ON "ScoreAgendaImport"("createdAt")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScoreAgendaRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "importId" TEXT NOT NULL,
        "sot" TEXT,
        "codCliente" TEXT,
        "dni" TEXT,
        "cliente" TEXT,
        "direccion" TEXT,
        "distrito" TEXT,
        "provincia" TEXT,
        "departamento" TEXT,
        "tipoBaja" TEXT,
        "tecnologia" TEXT,
        "tipoAdquisicion" TEXT,
        "tipoProducto" TEXT,
        "cantidadEquipos" INTEGER NOT NULL DEFAULT 1,
        "tipoBase" TEXT,
        "mesBase" TEXT,
        "proyecto" TEXT,
        "telefonoContactado" TEXT,
        "idCall" TEXT,
        "skill" TEXT,
        "idAgente" TEXT,
        "agenteNombre" TEXT,
        "resultadoMarcacion" TEXT,
        "novedadGeneral" TEXT,
        "tipificacion" TEXT,
        "tipificacionHist" TEXT,
        "fechaGestion" DATETIME,
        "comentarios" TEXT,
        "direccionActualizada" TEXT,
        "referencia" TEXT,
        "distritoAgenda" TEXT,
        "provinciaAgenda" TEXT,
        "departamentoAgenda" TEXT,
        "fechaAgenda" DATETIME,
        "horarioAgenda" TEXT,
        "telefonoReferencia" TEXT,
        "latitud" REAL,
        "longitud" REAL,
        "rangoHorario" TEXT,
        "tipoAgenda" TEXT,
        "rawData" TEXT NOT NULL DEFAULT '{}',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ScoreAgendaRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ScoreAgendaImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaRecord_importId_idx" ON "ScoreAgendaRecord"("importId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaRecord_fechaAgenda_idx" ON "ScoreAgendaRecord"("fechaAgenda")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaRecord_proyecto_idx" ON "ScoreAgendaRecord"("proyecto")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaRecord_departamento_idx" ON "ScoreAgendaRecord"("departamento")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScoreAgendaRecord_codCliente_idx" ON "ScoreAgendaRecord"("codCliente")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RutaProgramacion" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "agenteId" TEXT NOT NULL,
        "fecha" DATETIME NOT NULL,
        "totalVisitas" INTEGER NOT NULL DEFAULT 0,
        "totalDistanciaKm" REAL NOT NULL DEFAULT 0,
        "totalTiempoMin" REAL NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'GENERADA',
        "generadoPorEmail" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "RutaProgramacion_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "RutaAgente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaProgramacion_agenteId_idx" ON "RutaProgramacion"("agenteId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaProgramacion_fecha_idx" ON "RutaProgramacion"("fecha")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaProgramacion_status_idx" ON "RutaProgramacion"("status")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RutaParada" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "rutaId" TEXT NOT NULL,
        "secuencia" INTEGER NOT NULL,
        "periodo" TEXT NOT NULL,
        "esAgendada" BOOLEAN NOT NULL DEFAULT false,
        "sourceType" TEXT NOT NULL,
        "sourceId" TEXT,
        "sot" TEXT,
        "codCliente" TEXT,
        "cliente" TEXT,
        "direccion" TEXT,
        "distrito" TEXT,
        "departamento" TEXT,
        "latitud" REAL,
        "longitud" REAL,
        "telefono" TEXT,
        "distanciaDesdeAnteriorKm" REAL NOT NULL DEFAULT 0,
        "tiempoViajeMin" REAL NOT NULL DEFAULT 0,
        "duracionVisitaMin" REAL NOT NULL DEFAULT 10,
        "horaEstimadaLlegada" TEXT,
        "horaEstimadaSalida" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RutaParada_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES "RutaProgramacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaParada_rutaId_idx" ON "RutaParada"("rutaId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RutaParada_secuencia_idx" ON "RutaParada"("secuencia")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RutaExportConfig" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "fieldOrder" TEXT NOT NULL,
        "delimiter" TEXT NOT NULL DEFAULT ',',
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RutaExportConfig_name_key" ON "RutaExportConfig"("name")`);

    // Seed default RutaConfig values
    const defaultConfigs = [
      { key: "VELOCIDAD_PROMEDIO_KMH", value: "25", description: "Velocidad promedio de desplazamiento en km/h" },
      { key: "DURACION_VISITA_MIN", value: "10", description: "Duracion promedio de cada visita en minutos" },
      { key: "DISTANCIA_MAXIMA_KM", value: "10", description: "Distancia maxima permitida a la siguiente visita en km" },
      { key: "PERIODO_AM_INICIO", value: "08:00", description: "Hora de inicio del periodo AM" },
      { key: "PERIODO_AM_FIN", value: "12:00", description: "Hora de fin del periodo AM" },
      { key: "PERIODO_PM_INICIO", value: "13:00", description: "Hora de inicio del periodo PM" },
      { key: "PERIODO_PM_FIN", value: "17:00", description: "Hora de fin del periodo PM" },
    ];
    for (const cfg of defaultConfigs) {
      const exists = await prisma.$queryRawUnsafe<{ c: number }[]>(
        `SELECT count(*) as c FROM "RutaConfig" WHERE "key" = ?`, cfg.key
      );
      if (!exists[0]?.c) {
        const id = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "RutaConfig" ("id", "key", "value", "description", "updatedAt", "updatedBy") VALUES (?, ?, ?, ?, datetime('now'), 'system')`,
          id, cfg.key, cfg.value, cfg.description
        );
      }
    }

    // Seed default export config
    const exportExists = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*) as c FROM "RutaExportConfig" WHERE "name" = 'DEFAULT'`
    );
    if (!exportExists[0]?.c) {
      const id = crypto.randomUUID();
      const defaultFields = JSON.stringify([
        "secuencia", "periodo", "sot", "codCliente", "cliente", "direccion",
        "distrito", "departamento", "latitud", "longitud", "telefono",
        "distanciaDesdeAnteriorKm", "tiempoViajeMin", "duracionVisitaMin",
        "horaEstimadaLlegada", "horaEstimadaSalida", "esAgendada"
      ]);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RutaExportConfig" ("id", "name", "fieldOrder", "delimiter", "isDefault", "createdAt", "updatedAt") VALUES (?, 'DEFAULT', ?, ',', true, datetime('now'), datetime('now'))`,
        id, defaultFields
      );
    }

    console.log("[RECUPERO] All Recupero + ClientData + Rutas tables created successfully.");
    tablesChecked = true;
  } catch (err) {
    console.error("[RECUPERO] Failed to create tables:", err);
    throw err;
  }
}
