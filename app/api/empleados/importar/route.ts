import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

interface ColumnMapping {
  employeeCode: string | null;
  fullName: string | null;
  email: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  costCenter: string | null;
  costCenterDesc: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  position: string | null;
  phone: string | null;
  contractEnd: string | null;
}

/** Detect columns by header names (case-insensitive, flexible matching) */
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
    employeeCode: find(["id", "employeecode", "código", "codigo", "employee code", "code"]),
    fullName: find(["nombre del empleado", "fullname", "full name", "nombre", "empleado", "employee"]),
    email: find(["correo electrónico", "correo electronico", "email", "correo"]),
    hireDate: find(["primera fecha del contrato", "hiredate", "hire date", "fecha contrato", "fecha ingreso", "fecha de ingreso"]),
    terminationDate: find(["fecha de salida", "terminationdate", "termination", "fecha salida", "fecha cese"]),
    costCenter: find(["departamento", "costcenter", "cost center", "centro de costo", "centro costo", "department"]),
    costCenterDesc: find(["costcenterdesc", "desc centro", "descripción centro"]),
    supervisorName: find(["gerente", "supervisorname", "supervisor", "manager", "jefe"]),
    supervisorEmail: find(["supervisoremail", "supervisor email", "email gerente", "email supervisor"]),
    position: find(["puesto de trabajo", "position", "puesto", "cargo", "job title", "job position"]),
    phone: find(["teléfono", "telefono", "phone", "teléfono del trabajo"]),
    contractEnd: find(["fecha de vencimiento", "vencimiento permiso", "contract end", "contractend"]),
  };
}

function getVal(row: Record<string, unknown>, col: string | null): string {
  if (!col) return "";
  const val = row[col];
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  return String(val).trim();
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse rows from a structured array of objects (from CSV/TXT/XLSX) */
function parseRowsToRecords(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): { records: ImportRecord[]; errors: string[] } {
  const records: ImportRecord[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2; // +2 for header and 0-index

    const employeeCode = getVal(row, mapping.employeeCode);
    const fullName = getVal(row, mapping.fullName);
    const email = getVal(row, mapping.email);
    const hireDateStr = getVal(row, mapping.hireDate);

    if (!fullName && !employeeCode) {
      continue; // Skip empty rows
    }

    if (!fullName) {
      errors.push(`Fila ${lineNum}: nombre vacío`);
      continue;
    }

    const hireDate = parseDate(hireDateStr);
    const terminationDate = parseDate(getVal(row, mapping.terminationDate));
    const contractEnd = parseDate(getVal(row, mapping.contractEnd));
    const costCenter = getVal(row, mapping.costCenter);
    const supervisorName = getVal(row, mapping.supervisorName);
    const position = getVal(row, mapping.position);

    // Generate employee code if not provided
    const code = employeeCode || `EMP-${String(i + 1).padStart(4, "0")}`;
    // Generate email if not provided
    const emailVal = email || `${code.toLowerCase().replace(/[^a-z0-9]/g, "")}@pendiente.com`;

    records.push({
      employeeCode: code,
      fullName,
      email: emailVal,
      hireDate: hireDate || new Date(),
      terminationDate,
      costCenter: costCenter || "SIN-CC",
      costCenterDesc: getVal(row, mapping.costCenterDesc) || costCenter || "",
      supervisorName: supervisorName || "",
      supervisorEmail: getVal(row, mapping.supervisorEmail) || "",
      position: position || "",
      contractEnd,
    });
  }

  return { records, errors };
}

interface ImportRecord {
  employeeCode: string;
  fullName: string;
  email: string;
  hireDate: Date;
  terminationDate: Date | null;
  costCenter: string;
  costCenterDesc: string;
  supervisorName: string;
  supervisorEmail: string;
  position: string;
  contractEnd: Date | null;
}

/** Parse CSV content into array of objects */
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

/** Parse TXT with auto-detected delimiter */
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

/** Parse XLSX into array of objects */
function xlsxToObjects(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un archivo" },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { error: "El archivo no contiene datos válidos" },
        { status: 400 }
      );
    }

    // Detect column mapping from the first row's keys
    const headers = Object.keys(rows[0]);
    const mapping = detectColumns(headers);

    if (!mapping.fullName) {
      return NextResponse.json(
        { error: `No se encontró la columna de nombre. Columnas detectadas: ${headers.join(", ")}` },
        { status: 400 }
      );
    }

    const { records, errors: parseErrors } = parseRowsToRecords(rows, mapping);

    let imported = 0;
    let updated = 0;
    const errorDetails = [...parseErrors];

    for (const rec of records) {
      try {
        const existing = await prisma.employee.findFirst({
          where: {
            OR: [
              { employeeCode: rec.employeeCode },
              { email: rec.email },
            ],
          },
        });

        if (existing) {
          await prisma.employee.update({
            where: { id: existing.id },
            data: {
              fullName: rec.fullName,
              email: rec.email,
              hireDate: rec.hireDate,
              terminationDate: rec.terminationDate,
              costCenter: rec.costCenter,
              costCenterDesc: rec.costCenterDesc,
              supervisorName: rec.supervisorName,
              supervisorEmail: rec.supervisorEmail,
              position: rec.position,
              ...(rec.contractEnd && { contractEnd: rec.contractEnd }),
            },
          });
          updated++;
        } else {
          await prisma.employee.create({
            data: {
              employeeCode: rec.employeeCode,
              fullName: rec.fullName,
              email: rec.email,
              hireDate: rec.hireDate,
              terminationDate: rec.terminationDate,
              costCenter: rec.costCenter,
              costCenterDesc: rec.costCenterDesc,
              supervisorName: rec.supervisorName,
              supervisorEmail: rec.supervisorEmail,
              position: rec.position,
              ...(rec.contractEnd && { contractEnd: rec.contractEnd }),
            },
          });
          imported++;
        }
      } catch (err) {
        errorDetails.push(`Error ${rec.employeeCode}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    console.log(`[IMPORTACION] ${fileName}: ${imported} nuevos, ${updated} actualizados, ${errorDetails.length} errores`);

    return NextResponse.json({
      imported,
      updated,
      errors: errorDetails.length,
      errorDetails,
      columnsDetected: {
        employeeCode: mapping.employeeCode || "(auto-generado)",
        fullName: mapping.fullName,
        email: mapping.email || "(auto-generado)",
        hireDate: mapping.hireDate || "(fecha actual)",
        costCenter: mapping.costCenter || "(SIN-CC)",
        supervisorName: mapping.supervisorName || "(vacío)",
        position: mapping.position || "(vacío)",
      },
    });
  } catch (error) {
    console.error("[IMPORTACION] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar el archivo" },
      { status: 500 }
    );
  }
}
