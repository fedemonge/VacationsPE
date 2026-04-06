import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string;

    if (!file || !type) return NextResponse.json({ error: "Archivo y tipo son requeridos" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    // Normalize headers to lowercase with underscores
    const data = rawData.map((row) => {
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
        normalized[normalizedKey] = value;
      }
      return normalized;
    }).filter((row) => Object.values(row).some((v) => v !== null && v !== undefined && v !== ""));

    if (data.length === 0) return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });

    // Validate required columns per type
    const REQUIRED_COLUMNS: Record<string, string[]> = {
      demand: ["equipment_code", "month", "year", "quantity"],
      inventory: ["component_code", "quantity_on_hand", "month", "year"],
      recovery: ["equipment_code", "month", "year", "incoming_units"],
      equipment: ["equipment_code", "equipment_name", "component_code", "component_name", "qty_per_unit"],
      suppliers: ["supplier_name", "component_code", "unit_cost", "lead_time_days"],
    };

    const required = REQUIRED_COLUMNS[type];
    if (!required) return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });

    const headers = Object.keys(data[0]);
    const missing = required.filter((col) => !headers.includes(col));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Columnas faltantes: ${missing.join(", ")}`, headers }, { status: 400 });
    }

    // Validate rows
    const errors: string[] = [];
    for (let i = 0; i < data.length && errors.length < 50; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row (header is row 1)

      if (type === "demand" || type === "recovery") {
        if (!row.equipment_code) errors.push(`Fila ${rowNum}: equipment_code vacío`);
        const month = Number(row.month);
        if (isNaN(month) || month < 1 || month > 12) errors.push(`Fila ${rowNum}: mes inválido`);
        const year = Number(row.year);
        if (isNaN(year) || year < 2020 || year > 2100) errors.push(`Fila ${rowNum}: año inválido`);
        const qty = Number(type === "demand" ? row.quantity : row.incoming_units);
        if (isNaN(qty) || qty < 0) errors.push(`Fila ${rowNum}: cantidad inválida`);
      } else if (type === "inventory") {
        if (!row.component_code) errors.push(`Fila ${rowNum}: component_code vacío`);
        const qty = Number(row.quantity_on_hand);
        if (isNaN(qty) || qty < 0) errors.push(`Fila ${rowNum}: cantidad inválida`);
      } else if (type === "equipment") {
        if (!row.equipment_code || !row.component_code) errors.push(`Fila ${rowNum}: códigos vacíos`);
        const qty = Number(row.qty_per_unit);
        if (isNaN(qty) || qty <= 0) errors.push(`Fila ${rowNum}: qty_per_unit inválido`);
      } else if (type === "suppliers") {
        if (!row.supplier_name || !row.component_code) errors.push(`Fila ${rowNum}: campos vacíos`);
      }
    }

    return NextResponse.json({
      preview: data.slice(0, 10),
      headers,
      data,
      totalRows: data.length,
      errors,
    });
  } catch (error) {
    console.error("[MRP] Upload error:", error);
    return NextResponse.json({ error: "Error al procesar archivo" }, { status: 500 });
  }
}
