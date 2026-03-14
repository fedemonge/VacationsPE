import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

interface ColumnMapping {
  code: string | null;
  description: string | null;
  responsableName: string | null;
  responsableEmail: string | null;
}

function detectColumns(headers: string[]): ColumnMapping {
  const find = (patterns: string[]): string | null => {
    for (const h of headers) {
      const hl = h.toLowerCase().trim();
      for (const p of patterns) {
        if (hl === p || hl.includes(p)) return h;
      }
    }
    return null;
  };

  return {
    code: find(["código", "codigo", "code", "centro de costo", "centro costo", "costcenter", "cost center"]),
    description: find(["descripción", "descripcion", "description", "nombre", "name", "desc"]),
    responsableName: find(["responsable", "responsable nombre", "manager", "gerente", "jefe", "encargado"]),
    responsableEmail: find(["email responsable", "correo responsable", "email del responsable", "responsable email", "manager email", "email gerente", "correo"]),
  };
}

function getVal(row: Record<string, unknown>, col: string | null): string {
  if (!col) return "";
  const val = row[col];
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function csvToObjects(content: string): Record<string, unknown>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVLine(headerLine).map((h) => h.trim());
  const result: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (fields[j] || "").trim().replace(/^"|"$/g, "");
    }
    result.push(obj);
  }
  return result;
}

function txtToObjects(content: string): Record<string, unknown>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  let delimiter = ",";
  if (headerLine.includes("\t")) delimiter = "\t";
  else if (headerLine.includes("|")) delimiter = "|";
  else if (headerLine.includes(";")) delimiter = ";";
  if (delimiter === ",") return csvToObjects(content);
  const csvContent = lines
    .map((line) =>
      line.split(delimiter).map((f) => {
        const trimmed = f.trim();
        return trimmed.includes(",") ? `"${trimmed}"` : trimmed;
      }).join(",")
    )
    .join("\n");
  return csvToObjects(csvContent);
}

function xlsxToObjects(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role !== "ADMINISTRADOR" && session.role !== "RRHH") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });

    const fileName = file.name.toLowerCase();
    let rows: Record<string, unknown>[];

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      rows = xlsxToObjects(buffer);
    } else if (fileName.endsWith(".txt")) {
      const content = await file.text();
      rows = txtToObjects(content);
    } else {
      const content = await file.text();
      rows = csvToObjects(content);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "El archivo no contiene datos válidos" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const mapping = detectColumns(headers);

    if (!mapping.code && !mapping.description) {
      return NextResponse.json(
        { error: `No se detectaron columnas válidas. Columnas encontradas: ${headers.join(", ")}` },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;

      const code = getVal(row, mapping.code);
      const description = getVal(row, mapping.description);
      const responsableName = getVal(row, mapping.responsableName);
      const responsableEmail = getVal(row, mapping.responsableEmail);

      if (!code && !description) continue;

      if (!code) {
        errors.push(`Fila ${lineNum}: código vacío`);
        continue;
      }

      const trimmedCode = code.toUpperCase();

      try {
        const existing = await prisma.costCenter.findUnique({ where: { code: trimmedCode } });

        if (existing) {
          await prisma.costCenter.update({
            where: { id: existing.id },
            data: {
              ...(description && { description }),
              ...(responsableName && { responsableName }),
              ...(responsableEmail && { responsableEmail: responsableEmail.toLowerCase() }),
            },
          });
          updated++;
        } else {
          await prisma.costCenter.create({
            data: {
              code: trimmedCode,
              description: description || trimmedCode,
              responsableName: responsableName || "",
              responsableEmail: responsableEmail ? responsableEmail.toLowerCase() : "",
            },
          });
          imported++;
        }
      } catch (err) {
        errors.push(`Fila ${lineNum} (${trimmedCode}): ${err instanceof Error ? err.message : "error"}`);
      }
    }

    console.log(`[CENTROS_COSTOS] Import: ${imported} nuevos, ${updated} actualizados, ${errors.length} errores`);

    return NextResponse.json({
      imported,
      updated,
      errors: errors.length,
      errorDetails: errors,
      columnsDetected: {
        code: mapping.code || "(no detectado)",
        description: mapping.description || "(no detectado)",
        responsableName: mapping.responsableName || "(no detectado)",
        responsableEmail: mapping.responsableEmail || "(no detectado)",
      },
    });
  } catch (error) {
    console.error("[CENTROS_COSTOS] IMPORT ERROR:", error);
    return NextResponse.json({ error: "Error al procesar el archivo" }, { status: 500 });
  }
}
