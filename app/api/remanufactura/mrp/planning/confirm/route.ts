import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { type, data } = await req.json();

    if (!type || !data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "Tipo y datos son requeridos" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    if (type === "demand") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          const equipment = await prisma.mrpEquipment.findUnique({
            where: { code: String(row.equipment_code) },
          });
          if (!equipment) {
            errors.push(`Fila ${rowNum}: equipo "${row.equipment_code}" no encontrado`);
            continue;
          }
          const result = await prisma.mrpDemandForecast.upsert({
            where: {
              equipmentId_month_year: {
                equipmentId: equipment.id,
                month: Number(row.month),
                year: Number(row.year),
              },
            },
            create: {
              equipmentId: equipment.id,
              month: Number(row.month),
              year: Number(row.year),
              quantity: Number(row.quantity),
              uploadedByEmail: session.email,
            },
            update: {
              quantity: Number(row.quantity),
              uploadedByEmail: session.email,
            },
          });
          if (result.uploadedAt.getTime() === result.uploadedAt.getTime()) {
            // Check if it was an update by comparing: upsert always returns a record
            // We track via a simple heuristic: if the record existed, it's updated
            updated++;
          }
          created++;
        } catch (e) {
          errors.push(`Fila ${rowNum}: ${(e as Error).message}`);
        }
      }
      // Adjust counts: upsert doesn't distinguish, so total = created, updated is unknown
      // Reset to use a different approach
      created = data.length - errors.length;
      updated = 0;
    } else if (type === "inventory") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          const material = await prisma.mrpMaterial.findUnique({
            where: { code: String(row.component_code) },
          });
          if (!material) {
            errors.push(`Fila ${rowNum}: material "${row.component_code}" no encontrado`);
            continue;
          }
          await prisma.mrpInventorySnapshot.upsert({
            where: {
              materialId_month_year: {
                materialId: material.id,
                month: Number(row.month),
                year: Number(row.year),
              },
            },
            create: {
              materialId: material.id,
              month: Number(row.month),
              year: Number(row.year),
              quantityOnHand: Number(row.quantity_on_hand),
              uploadedByEmail: session.email,
            },
            update: {
              quantityOnHand: Number(row.quantity_on_hand),
              uploadedByEmail: session.email,
            },
          });
          created++;
        } catch (e) {
          errors.push(`Fila ${rowNum}: ${(e as Error).message}`);
        }
      }
      created = data.length - errors.length;
    } else if (type === "recovery") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          const equipment = await prisma.mrpEquipment.findUnique({
            where: { code: String(row.equipment_code) },
          });
          if (!equipment) {
            errors.push(`Fila ${rowNum}: equipo "${row.equipment_code}" no encontrado`);
            continue;
          }
          await prisma.mrpRecoveryForecast.upsert({
            where: {
              equipmentId_month_year: {
                equipmentId: equipment.id,
                month: Number(row.month),
                year: Number(row.year),
              },
            },
            create: {
              equipmentId: equipment.id,
              month: Number(row.month),
              year: Number(row.year),
              incomingUnits: Number(row.incoming_units),
              uploadedByEmail: session.email,
            },
            update: {
              incomingUnits: Number(row.incoming_units),
              uploadedByEmail: session.email,
            },
          });
          created++;
        } catch (e) {
          errors.push(`Fila ${rowNum}: ${(e as Error).message}`);
        }
      }
      created = data.length - errors.length;
    } else if (type === "equipment") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          // Upsert equipment
          const equipment = await prisma.mrpEquipment.upsert({
            where: { code: String(row.equipment_code) },
            create: {
              code: String(row.equipment_code),
              name: String(row.equipment_name),
              category: row.category ? String(row.category) : null,
              recoveryYieldPct: row.recovery_yield_pct ? Number(row.recovery_yield_pct) : 0,
            },
            update: {
              name: String(row.equipment_name),
              category: row.category ? String(row.category) : undefined,
              recoveryYieldPct: row.recovery_yield_pct != null ? Number(row.recovery_yield_pct) : undefined,
            },
          });

          // Parse recoverable as boolean
          const recoverableRaw = row.recoverable;
          const isRecoverable =
            recoverableRaw === true ||
            recoverableRaw === 1 ||
            String(recoverableRaw).toLowerCase() === "true" ||
            String(recoverableRaw).toLowerCase() === "yes" ||
            String(recoverableRaw).toLowerCase() === "si" ||
            String(recoverableRaw).toLowerCase() === "sí" ||
            String(recoverableRaw) === "1";

          // Upsert material
          const material = await prisma.mrpMaterial.upsert({
            where: { code: String(row.component_code) },
            create: {
              code: String(row.component_code),
              name: String(row.component_name),
              unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : "unit",
              isRecoverable,
              recoveryYieldPct: row.component_yield_pct != null ? Number(row.component_yield_pct) : null,
            },
            update: {
              name: String(row.component_name),
              unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : undefined,
              isRecoverable,
              recoveryYieldPct: row.component_yield_pct != null ? Number(row.component_yield_pct) : undefined,
            },
          });

          // Find or create BOM item
          const existingBom = await prisma.mrpBomItem.findFirst({
            where: { equipmentId: equipment.id, materialId: material.id },
          });
          if (existingBom) {
            await prisma.mrpBomItem.update({ where: { id: existingBom.id }, data: { quantityPerUnit: Number(row.qty_per_unit) } });
          } else {
            await prisma.mrpBomItem.create({ data: { equipmentId: equipment.id, materialId: material.id, quantityPerUnit: Number(row.qty_per_unit) } });
          }
          created++;
        } catch (e) {
          errors.push(`Fila ${rowNum}: ${(e as Error).message}`);
        }
      }
      created = data.length - errors.length;
    } else if (type === "suppliers") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          // Find or create supplier
          let supplier = await prisma.mrpSupplier.findFirst({
            where: { name: String(row.supplier_name) },
          });
          if (!supplier) {
            supplier = await prisma.mrpSupplier.create({
              data: {
                name: String(row.supplier_name),
                contactName: row.contact ? String(row.contact) : null,
                email: row.email ? String(row.email) : null,
                phone: row.phone ? String(row.phone) : null,
                country: row.country ? String(row.country) : null,
                currency: row.currency ? String(row.currency) : "USD",
              },
            });
          }

          // Find material
          const material = await prisma.mrpMaterial.findUnique({
            where: { code: String(row.component_code) },
          });
          if (!material) {
            errors.push(`Fila ${rowNum}: material "${row.component_code}" no encontrado`);
            continue;
          }

          // Parse preferred as boolean
          const preferredRaw = row.preferred;
          const isPreferred =
            preferredRaw === true ||
            preferredRaw === 1 ||
            String(preferredRaw).toLowerCase() === "true" ||
            String(preferredRaw).toLowerCase() === "yes" ||
            String(preferredRaw).toLowerCase() === "si" ||
            String(preferredRaw).toLowerCase() === "sí" ||
            String(preferredRaw) === "1";

          // Upsert supplier item
          await prisma.mrpSupplierItem.upsert({
            where: {
              supplierId_materialId: {
                supplierId: supplier.id,
                materialId: material.id,
              },
            },
            create: {
              supplierId: supplier.id,
              materialId: material.id,
              unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : "unit",
              purchaseUnit: row.purchase_unit ? String(row.purchase_unit) : null,
              purchaseUnitQty: row.purchase_unit_qty ? Number(row.purchase_unit_qty) : 1,
              unitCost: Number(row.unit_cost),
              moq: row.moq ? Number(row.moq) : 1,
              isPreferred,
            },
            update: {
              unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : undefined,
              purchaseUnit: row.purchase_unit ? String(row.purchase_unit) : undefined,
              purchaseUnitQty: row.purchase_unit_qty ? Number(row.purchase_unit_qty) : undefined,
              unitCost: Number(row.unit_cost),
              moq: row.moq ? Number(row.moq) : undefined,
              isPreferred,
            },
          });
          created++;
        } catch (e) {
          errors.push(`Fila ${rowNum}: ${(e as Error).message}`);
        }
      }
      created = data.length - errors.length;
    } else {
      return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
    }

    return NextResponse.json({ created, updated, errors });
  } catch (error) {
    console.error("[MRP] Confirm error:", error);
    return NextResponse.json({ error: "Error al guardar datos" }, { status: 500 });
  }
}
