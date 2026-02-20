import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

async function ensureBackupsDir(): Promise<void> {
  try {
    await fs.access(BACKUPS_DIR);
  } catch {
    await fs.mkdir(BACKUPS_DIR, { recursive: true });
  }
}

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// GET: list all backups
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden gestionar respaldos" },
        { status: 403 }
      );
    }

    await ensureBackupsDir();

    const files = await fs.readdir(BACKUPS_DIR);
    const backups = [];

    for (const file of files) {
      if (!file.endsWith(".db")) continue;
      const filePath = path.join(BACKUPS_DIR, file);
      const stat = await fs.stat(filePath);
      backups.push({
        filename: file,
        size: stat.size,
        sizeFormatted: formatFileSize(stat.size),
        createdAt: stat.mtime.toISOString(),
        type: file.startsWith("auto_") ? "Automático" : "Manual",
      });
    }

    // Sort by date descending (newest first)
    backups.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ backups });
  } catch (error) {
    console.error("[BACKUP] ERROR listando:", error);
    return NextResponse.json(
      { error: "Error al listar respaldos" },
      { status: 500 }
    );
  }
}

// POST: create a new backup
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden crear respaldos" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const isAutomatic = body.automatic === true;

    await ensureBackupsDir();

    // Check that the DB file exists
    try {
      await fs.access(DB_PATH);
    } catch {
      return NextResponse.json(
        { error: "No se encontró la base de datos" },
        { status: 500 }
      );
    }

    const prefix = isAutomatic ? "auto" : "manual";
    const timestamp = formatDate(new Date());
    const backupFilename = `${prefix}_backup_${timestamp}.db`;
    const backupPath = path.join(BACKUPS_DIR, backupFilename);

    // Copy the database file
    await fs.copyFile(DB_PATH, backupPath);

    const stat = await fs.stat(backupPath);

    console.log(
      `[BACKUP] CREADO: ${backupFilename} (${formatFileSize(stat.size)}) por ${session.email}`
    );

    return NextResponse.json({
      message: `Respaldo creado exitosamente: ${backupFilename}`,
      backup: {
        filename: backupFilename,
        size: stat.size,
        sizeFormatted: formatFileSize(stat.size),
        createdAt: stat.mtime.toISOString(),
        type: isAutomatic ? "Automático" : "Manual",
      },
    });
  } catch (error) {
    console.error("[BACKUP] ERROR creando:", error);
    return NextResponse.json(
      { error: "Error al crear respaldo" },
      { status: 500 }
    );
  }
}

// DELETE: delete a backup
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden eliminar respaldos" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
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

    await fs.unlink(backupPath);

    console.log(
      `[BACKUP] ELIMINADO: ${sanitized} por ${session.email}`
    );

    return NextResponse.json({
      message: `Respaldo ${sanitized} eliminado`,
    });
  } catch (error) {
    console.error("[BACKUP] ERROR eliminando:", error);
    return NextResponse.json(
      { error: "Error al eliminar respaldo" },
      { status: 500 }
    );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
