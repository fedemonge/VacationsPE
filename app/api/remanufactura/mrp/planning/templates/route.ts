import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

const TEMPLATES: Record<string, { columns: string[]; sample: Record<string, any> }> = {
  demand: {
    columns: ["equipment_code", "month", "year", "quantity"],
    sample: { equipment_code: "EQ-001", month: 1, year: 2026, quantity: 100 },
  },
  inventory: {
    columns: ["component_code", "quantity_on_hand", "month", "year"],
    sample: { component_code: "COMP-001", quantity_on_hand: 50, month: 1, year: 2026 },
  },
  recovery: {
    columns: ["equipment_code", "month", "year", "incoming_units"],
    sample: { equipment_code: "EQ-001", month: 1, year: 2026, incoming_units: 30 },
  },
  equipment: {
    columns: [
      "equipment_code", "equipment_name", "category", "recovery_yield_pct",
      "component_code", "component_name", "unit_of_measure", "qty_per_unit",
      "recoverable", "component_yield_pct",
    ],
    sample: {
      equipment_code: "EQ-001",
      equipment_name: "Decodificador HD",
      category: "DirecTV",
      recovery_yield_pct: 70,
      component_code: "COMP-001",
      component_name: "Placa principal",
      unit_of_measure: "unit",
      qty_per_unit: 1,
      recoverable: "true",
      component_yield_pct: 60,
    },
  },
  suppliers: {
    columns: [
      "supplier_name", "contact", "email", "phone", "country", "currency",
      "component_code", "unit_of_measure", "purchase_unit", "purchase_unit_qty",
      "unit_cost", "moq", "lead_time_days", "preferred",
    ],
    sample: {
      supplier_name: "Proveedor Ejemplo",
      contact: "Juan Pérez",
      email: "juan@proveedor.com",
      phone: "+51 999 888 777",
      country: "Peru",
      currency: "USD",
      component_code: "COMP-001",
      unit_of_measure: "unit",
      purchase_unit: "caja",
      purchase_unit_qty: 10,
      unit_cost: 15.5,
      moq: 100,
      lead_time_days: 30,
      preferred: "true",
    },
  },
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  if (!type || !TEMPLATES[type]) {
    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  }

  const template = TEMPLATES[type];
  const workbook = XLSX.utils.book_new();

  // Build data array: header row + sample row
  const wsData = [template.columns, template.columns.map((col) => template.sample[col] ?? "")];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  worksheet["!cols"] = template.columns.map((col) => ({
    wch: Math.max(col.length + 2, 15),
  }));

  XLSX.utils.book_append_sheet(workbook, worksheet, type);

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mrp_template_${type}.xlsx"`,
    },
  });
}
