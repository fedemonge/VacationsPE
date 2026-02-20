import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// POST: restore a backup
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden restaurar respaldos" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { filename } = body;

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "Nombre de archivo es obligatorio" },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith(".db")) {
      return NextResponse.json(
        { error: "Archivo inválido" },
        { status: 400 }
      );
    }

    const backupPath = path.join(BACKUPS_DIR, sanitized);

    try {
      await fs.access(backupPath);
    } catch {
      return NextResponse.json(
        { error: "Respaldo no encontrado" },
        { status: 404 }
      );
    }

    // Create a safety backup of current DB before restoring
    const safetyTimestamp = formatDate(new Date());
    const safetyBackupName = `pre_restore_${safetyTimestamp}.db`;
    const safetyBackupPath = path.join(BACKUPS_DIR, safetyBackupName);

    try {
      await fs.access(BACKUPS_DIR);
    } catch {
      await fs.mkdir(BACKUPS_DIR, { recursive: true });
    }

    await fs.copyFile(DB_PATH, safetyBackupPath);

    // Disconnect Prisma before replacing the DB file
    await prisma.$disconnect();

    // Replace the database with the backup
    await fs.copyFile(backupPath, DB_PATH);

    console.log(
      `[BACKUP] RESTAURADO: ${sanitized} por ${session.email} (respaldo de seguridad: ${safetyBackupName})`
    );

    return NextResponse.json({
      message: `Base de datos restaurada desde ${sanitized}. Se creó un respaldo de seguridad: ${safetyBackupName}. La aplicación necesita reiniciarse para reflejar los cambios.`,
      safetyBackup: safetyBackupName,
    });
  } catch (error) {
    console.error("[BACKUP] ERROR restaurando:", error);
    return NextResponse.json(
      { error: "Error al restaurar respaldo" },
      { status: 500 }
    );
  }
}
