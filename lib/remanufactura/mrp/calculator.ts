import { prisma } from '@/lib/prisma';
import {
  selectSupplier,
  type SupplierItemWithSupplier,
} from './supplier-selector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MrpInput {
  startMonth: number; // 1-12
  startYear: number;
  horizonMonths: number; // default 12
}

export interface MrpResult {
  purchasePlans: PurchasePlanItem[];
  productionPlans: ProductionPlanItem[];
  alerts: MrpAlert[];
}

export interface PurchasePlanItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  supplierId?: string;
  supplierItemId?: string;
  supplierName?: string;
  month: number;
  year: number;
  inventoryInitial: number;
  quantityNeeded: number;
  quantityRecovered: number;
  quantityToPurchase: number;
  inventoryFinal: number;
  productionOutput: number;
  orderDate: Date | null;
  deliveryDate: Date | null;
  unitCost: number;
  totalCost: number;
}

export interface ProductionPlanItem {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  subProcessId: string;
  subProcessName: string;
  shiftId?: string;
  shiftName?: string;
  month: number;
  year: number;
  unitsToProcess: number;
  laborHoursRequired: number;
  headcountRequired: number;
  isSpecialist: boolean;
}

export interface MrpAlert {
  type: 'LEAD_TIME' | 'CAPACITY' | 'NO_SUPPLIER' | 'LOW_YIELD' | 'INVENTORY_SHORT';
  severity: 'warning' | 'critical';
  message: string;
  month: number;
  year: number;
  relatedId: string;
}

// ---------------------------------------------------------------------------
// Internal types for the flattened BOM
// ---------------------------------------------------------------------------

interface FlatBomItem {
  materialId: string;
  materialCode: string;
  materialName: string;
  quantityPerUnit: number;
  recoveryYieldPct: number | null;
  isRecoverable: boolean;
  safetyStockQty: number;
  unitCost: number;
  costPerQty: number;
  leadTimeDays: number;
  supplierItems: SupplierItemWithSupplier[];
  mainSupplier: { id: string; name: string; isActive: boolean } | null;
  backupSupplier: { id: string; name: string; isActive: boolean } | null;
}

interface BomItemWithChildren {
  id: string;
  quantityPerUnit: number;
  parentBomItemId: string | null;
  material: {
    id: string;
    code: string;
    name: string;
    recoveryYieldPct: number | null;
    isRecoverable: boolean;
    safetyStockQty: number;
    unitCost: number;
    costPerQty: number;
    leadTimeDays: number;
    supplierItems: SupplierItemWithSupplier[];
    mainSupplier: { id: string; name: string; isActive: boolean } | null;
    backupSupplier: { id: string; name: string; isActive: boolean } | null;
  };
  children: BomItemWithChildren[];
}

// ---------------------------------------------------------------------------
// Helper: Build lookup maps
// ---------------------------------------------------------------------------

type PeriodKey = string;

function periodKey(month: number, year: number): PeriodKey {
  return `${month}-${year}`;
}

function buildDemandMap(
  demands: { equipmentId: string; month: number; year: number; quantity: number }[]
): Record<string, Record<PeriodKey, number>> {
  const map: Record<string, Record<PeriodKey, number>> = {};
  for (const d of demands) {
    if (!map[d.equipmentId]) map[d.equipmentId] = {};
    map[d.equipmentId][periodKey(d.month, d.year)] = d.quantity;
  }
  return map;
}

function buildInventoryMap(
  inventory: { materialId: string; month: number; year: number; quantityOnHand: number }[]
): Record<string, Record<PeriodKey, number>> {
  const map: Record<string, Record<PeriodKey, number>> = {};
  for (const inv of inventory) {
    if (!map[inv.materialId]) map[inv.materialId] = {};
    map[inv.materialId][periodKey(inv.month, inv.year)] = inv.quantityOnHand;
  }
  return map;
}

function buildRecoveryMap(
  recovery: { equipmentId: string; month: number; year: number; incomingUnits: number }[]
): Record<string, Record<PeriodKey, number>> {
  const map: Record<string, Record<PeriodKey, number>> = {};
  for (const r of recovery) {
    if (!map[r.equipmentId]) map[r.equipmentId] = {};
    map[r.equipmentId][periodKey(r.month, r.year)] = r.incomingUnits;
  }
  return map;
}

function buildCalendarMap(
  calendars: { month: number; year: number; workingDays: number }[]
): Record<PeriodKey, number> {
  const map: Record<PeriodKey, number> = {};
  for (const c of calendars) {
    map[periodKey(c.month, c.year)] = c.workingDays;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helper: Flatten multi-level BOM
// ---------------------------------------------------------------------------

function flattenBom(
  items: BomItemWithChildren[],
  parentQtyMultiplier: number = 1
): FlatBomItem[] {
  const result: FlatBomItem[] = [];

  for (const item of items) {
    // effectiveQty = quantityPerUnit / qtyPer (e.g., 25 per 25 = 1 per unit, or 100 per 1000)
    const qtyPer = (item as any).qtyPer || 1;
    const accumulatedQty = parentQtyMultiplier * (item.quantityPerUnit / qtyPer);
    const mat = item.material;

    const flatItem: FlatBomItem = {
      materialId: mat.id,
      materialCode: mat.code,
      materialName: mat.name,
      quantityPerUnit: accumulatedQty,
      recoveryYieldPct: mat.recoveryYieldPct,
      isRecoverable: mat.isRecoverable,
      safetyStockQty: mat.safetyStockQty,
      unitCost: mat.unitCost,
      costPerQty: mat.costPerQty || 1,
      leadTimeDays: mat.leadTimeDays,
      supplierItems: mat.supplierItems,
      mainSupplier: mat.mainSupplier,
      backupSupplier: mat.backupSupplier,
    };

    if (item.children && item.children.length > 0) {
      result.push(flatItem);
      result.push(...flattenBom(item.children, accumulatedQty));
    } else {
      result.push(flatItem);
    }
  }

  return result;
}

function buildBomTree(
  items: BomItemWithChildren[]
): BomItemWithChildren[] {
  const map = new Map<string, BomItemWithChildren>();
  const roots: BomItemWithChildren[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentBomItemId && map.has(item.parentBomItemId)) {
      map.get(item.parentBomItemId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Helper: Lookup accessors with defaults
// ---------------------------------------------------------------------------

function getDemand(
  demandMap: Record<string, Record<PeriodKey, number>>,
  equipmentId: string,
  month: number,
  year: number
): number {
  return demandMap[equipmentId]?.[periodKey(month, year)] ?? 0;
}

function getRecovery(
  recoveryMap: Record<string, Record<PeriodKey, number>>,
  equipmentId: string,
  month: number,
  year: number
): number {
  return recoveryMap[equipmentId]?.[periodKey(month, year)] ?? 0;
}

function getInventory(
  inventoryMap: Record<string, Record<PeriodKey, number>>,
  componentId: string,
  month: number,
  year: number
): number {
  return inventoryMap[componentId]?.[periodKey(month, year)] ?? 0;
}

// ---------------------------------------------------------------------------
// Helper: Calculate shift hours
// ---------------------------------------------------------------------------

function shiftDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let hours = eh + em / 60 - (sh + sm / 60);
  if (hours <= 0) hours += 24;
  return hours;
}

// ---------------------------------------------------------------------------
// Main MRP Calculation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: Flatten composable rutas (recursive, with cycle detection)
// ---------------------------------------------------------------------------

interface RutaStepRaw {
  id: string;
  sequenceOrder: number;
  laborHoursPerUnit: number;
  isParallel: boolean;
  subProcessId: string | null;
  subProcess: { id: string; name: string; capacityPerHour: number; requiresSpecialist: boolean } | null;
  childRutaId: string | null;
}

interface RutaRaw {
  id: string;
  steps: RutaStepRaw[];
}

interface FlatRutaStep {
  subProcessId: string;
  subProcessName: string;
  capacityPerHour: number;
  requiresSpecialist: boolean;
  laborHoursPerUnit: number;
  isParallel: boolean;
}

function flattenRutaSteps(
  ruta: RutaRaw,
  allRutas: Map<string, RutaRaw>,
  visited: Set<string> = new Set()
): FlatRutaStep[] {
  if (visited.has(ruta.id)) return []; // prevent circular references
  visited.add(ruta.id);

  const result: FlatRutaStep[] = [];
  for (const step of ruta.steps) {
    if (step.subProcessId && step.subProcess) {
      // Direct sub-process step
      result.push({
        subProcessId: step.subProcess.id,
        subProcessName: step.subProcess.name,
        capacityPerHour: step.subProcess.capacityPerHour,
        requiresSpecialist: step.subProcess.requiresSpecialist,
        laborHoursPerUnit: step.laborHoursPerUnit,
        isParallel: step.isParallel,
      });
    } else if (step.childRutaId) {
      // Reference to another ruta — recursively flatten
      const childRuta = allRutas.get(step.childRutaId);
      if (childRuta) {
        result.push(...flattenRutaSteps(childRuta, allRutas, new Set(visited)));
      }
    }
  }
  return result;
}

export async function runMrpCalculation(input: MrpInput): Promise<MrpResult> {
  // 1. Load all master data
  const equipment = await prisma.mrpEquipment.findMany({
    where: { isActive: true },
    include: {
      bomItems: {
        include: {
          material: {
            include: {
              supplierItems: { include: { supplier: true } },
              mainSupplier: true,
              backupSupplier: true,
            },
          },
          childEquipment: { select: { id: true, code: true, name: true } },
          children: true,
        },
      },
      equipmentRutas: {
        include: { ruta: true },
        orderBy: { sequenceOrder: 'asc' },
      },
    },
  });

  // Load ALL rutas with steps for recursive flattening
  const allRutasRaw = await prisma.mrpRuta.findMany({
    where: { isActive: true },
    include: {
      steps: {
        include: { subProcess: true },
        orderBy: { sequenceOrder: 'asc' },
      },
    },
  });
  const allRutasMap = new Map<string, RutaRaw>(allRutasRaw.map((r) => [r.id, r]));

  const shifts = await prisma.mrpShiftConfig.findMany({
    where: { isActive: true },
    orderBy: { costMultiplier: 'asc' },
  });

  // 2. Build period array for the horizon
  const periods: { month: number; year: number }[] = [];
  let m = input.startMonth;
  let y = input.startYear;
  for (let i = 0; i < input.horizonMonths; i++) {
    periods.push({ month: m, year: y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  // 3. Load all planning data for the horizon
  const periodFilter = periods.map((p) => ({ month: p.month, year: p.year }));

  const [demands, inventory, recovery, calendars] = await Promise.all([
    prisma.mrpDemandForecast.findMany({ where: { OR: periodFilter } }),
    prisma.mrpInventorySnapshot.findMany({ where: { OR: periodFilter } }),
    prisma.mrpRecoveryForecast.findMany({ where: { OR: periodFilter } }),
    prisma.mrpWorkingCalendar.findMany({ where: { OR: periodFilter } }),
  ]);

  // 4. Build lookup maps
  const demandMap = buildDemandMap(demands);
  const inventoryMap = buildInventoryMap(inventory);
  const recoveryMap = buildRecoveryMap(recovery);
  const calendarMap = buildCalendarMap(calendars);

  const purchasePlans: PurchasePlanItem[] = [];
  const productionPlans: ProductionPlanItem[] = [];
  const alerts: MrpAlert[] = [];

  const inventoryCarryover: Record<string, number> = {};

  // 5. For each period, process all equipment
  for (const period of periods) {
    const key = periodKey(period.month, period.year);
    const workingDays = calendarMap[key] ?? 22;

    // PASS 0: Resolve dependent demand (sub-assemblies)
    // If N2's BOM contains N1 as a sub-assembly (childEquipmentId),
    // then N2's demand cascades into N1's demand.
    const equipDemand: Record<string, number> = {};
    const equipRecovery: Record<string, number> = {};

    // Initialize with independent demand
    for (const equip of equipment) {
      const d = getDemand(demandMap, equip.id, period.month, period.year);
      equipDemand[equip.id] = (equipDemand[equip.id] ?? 0) + d;
      const incoming = getRecovery(recoveryMap, equip.id, period.month, period.year);
      equipRecovery[equip.id] = Math.floor(incoming * (equip.recoveryYieldPct / 100));
    }

    // Cascade dependent demand: if equip A has child equip B in its BOM,
    // then A's demand × qty adds to B's demand
    for (const equip of equipment) {
      const demand = equipDemand[equip.id] ?? 0;
      if (demand === 0) continue;
      for (const bi of equip.bomItems) {
        if ((bi as any).childEquipmentId && (bi as any).childEquipment) {
          const childId = (bi as any).childEquipmentId as string;
          const qtyPer = (bi as any).qtyPer || 1;
          const dependentDemand = Math.ceil(demand * bi.quantityPerUnit / qtyPer);
          equipDemand[childId] = (equipDemand[childId] ?? 0) + dependentDemand;
        }
      }
    }

    // PASS 1: Aggregate material demand + recovery across ALL equipment for this period
    interface MatAgg {
      materialDemand: number;
      materialRecovered: number;
      totalEquipDemand: number;
      mat: FlatBomItem;
    }
    const matAggMap = new Map<string, MatAgg>();

    for (const equip of equipment) {
      // Use resolved demand (independent + dependent from parent assemblies)
      const demand = equipDemand[equip.id] ?? 0;
      const recoveredUnits = equipRecovery[equip.id] ?? 0;
      const incomingUnits = getRecovery(recoveryMap, equip.id, period.month, period.year);

      if (demand === 0 && incomingUnits === 0) continue;

      if (incomingUnits > 0 && equip.recoveryYieldPct < 30) {
        alerts.push({
          type: 'LOW_YIELD',
          severity: 'warning',
          message: `Rendimiento bajo de recuperación (${equip.recoveryYieldPct}%) para ${equip.name}. ${incomingUnits} unidades entrantes generan solo ${recoveredUnits} unidades recuperadas.`,
          month: period.month,
          year: period.year,
          relatedId: equip.id,
        });
      }

      // Filter to material BOM items only (skip child equipment sub-assemblies)
      const materialBomItems = equip.bomItems.filter((bi: any) => bi.materialId && bi.material);
      const bomTree = buildBomTree(materialBomItems as unknown as BomItemWithChildren[]);
      const flatBom = flattenBom(bomTree);

      for (const mat of flatBom) {
        const matDemand = Math.ceil(demand * mat.quantityPerUnit);
        // Only recoverable materials get recovery credit
        const matRecov = mat.isRecoverable ? Math.floor(recoveredUnits * mat.quantityPerUnit) : 0;

        const existing = matAggMap.get(mat.materialId);
        if (existing) {
          existing.materialDemand += matDemand;
          existing.materialRecovered += matRecov;
          existing.totalEquipDemand += demand;
        } else {
          matAggMap.set(mat.materialId, {
            materialDemand: matDemand,
            materialRecovered: matRecov,
            totalEquipDemand: demand,
            mat,
          });
        }
      }
    }

    // PASS 2: Calculate purchases per aggregated material
    for (const [, agg] of Array.from(matAggMap)) {
      const { mat, materialDemand, materialRecovered, totalEquipDemand } = agg;

      // Inventory on hand (snapshot or carryover)
      const snapshotOnHand = getInventory(inventoryMap, mat.materialId, period.month, period.year);
      const carryover = inventoryCarryover[mat.materialId] ?? 0;
      const inventoryInitial = snapshotOnHand > 0 ? snapshotOnHand : carryover;

      // A Comprar = Demanda - Inv.Inicial - Recuperados + Stock Seguridad
      const purchaseQty = Math.ceil(Math.max(0,
        materialDemand - inventoryInitial - materialRecovered + mat.safetyStockQty
      ));

      if (materialDemand > inventoryInitial + materialRecovered) {
        alerts.push({
          type: 'INVENTORY_SHORT',
          severity: 'warning',
          message: `"${mat.materialName}": demanda ${materialDemand.toFixed(0)}, inventario ${inventoryInitial.toFixed(0)}, recuperados ${materialRecovered.toFixed(0)} (${period.month}/${period.year}).`,
          month: period.month,
          year: period.year,
          relatedId: mat.materialId,
        });
      }

      if (purchaseQty <= 0 && materialDemand === 0) continue;

      const deliveryDate = new Date(period.year, period.month - 1, 1);

      // Supplier selection
      let effectiveSupplierItems = mat.supplierItems;
      if (effectiveSupplierItems.length === 0) {
        const synth: SupplierItemWithSupplier[] = [];
        if (mat.mainSupplier && mat.mainSupplier.isActive) {
          synth.push({ id: `synth-main-${mat.materialId}`, unitCost: 0, moq: 1, isPreferred: true, purchaseUnitQty: 1, supplier: mat.mainSupplier });
        }
        if (mat.backupSupplier && mat.backupSupplier.isActive) {
          synth.push({ id: `synth-backup-${mat.materialId}`, unitCost: 0, moq: 1, isPreferred: false, purchaseUnitQty: 1, supplier: mat.backupSupplier });
        }
        effectiveSupplierItems = synth;
      }

      const { supplier, supplierItem, alert } = selectSupplier(
        effectiveSupplierItems, purchaseQty, deliveryDate, mat.materialName,
        period.month, period.year, mat.materialId, mat.leadTimeDays
      );
      if (alert) alerts.push(alert);

      let orderDate: Date | null = null;
      if (mat.leadTimeDays > 0) {
        orderDate = new Date(deliveryDate);
        orderDate.setDate(orderDate.getDate() - mat.leadTimeDays);
      }

      let adjustedQty = purchaseQty;
      if (supplierItem) {
        if (supplierItem.moq && adjustedQty < supplierItem.moq) adjustedQty = supplierItem.moq;
        if (supplierItem.purchaseUnitQty && supplierItem.purchaseUnitQty > 1) {
          adjustedQty = Math.ceil(adjustedQty / supplierItem.purchaseUnitQty) * supplierItem.purchaseUnitQty;
        }
      }

      const matCostPerQty = (mat as any).costPerQty || 1;
      const unitCost = supplierItem?.unitCost || (mat.unitCost / matCostPerQty) || 0;

      // Inv.Final = Inv.Inicial + Recuperados + Compras - Demanda
      const inventoryFinal = Math.max(0, inventoryInitial + materialRecovered + adjustedQty - materialDemand);
      inventoryCarryover[mat.materialId] = inventoryFinal;

      purchasePlans.push({
        materialId: mat.materialId,
        materialCode: mat.materialCode,
        materialName: mat.materialName,
        supplierId: supplier?.id,
        supplierItemId: supplierItem?.id,
        supplierName: supplier?.name,
        month: period.month,
        year: period.year,
        inventoryInitial,
        quantityNeeded: materialDemand,
        quantityRecovered: materialRecovered,
        quantityToPurchase: adjustedQty,
        inventoryFinal,
        productionOutput: totalEquipDemand,
        orderDate,
        deliveryDate,
        unitCost,
        totalCost: adjustedQty * unitCost,
      });
    }

    // 7. Production plans per equipment (using resolved demand including dependent)
    for (const equip of equipment) {
      const demand = equipDemand[equip.id] ?? 0;
      if (demand === 0) continue;

      // 7. Calculate production plan per sub-process (via flattened Ruta)
      // Flatten all assigned rutas in sequence order
      const equipRutas = ((equip as any).equipmentRutas || [])
        .sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder);
      const allFlatSteps: FlatRutaStep[] = [];
      for (const er of equipRutas) {
        const ruta = allRutasMap.get(er.rutaId || er.ruta?.id);
        if (ruta) allFlatSteps.push(...flattenRutaSteps(ruta, allRutasMap));
      }
      const flatSteps = allFlatSteps.length > 0 ? allFlatSteps
        : [];
      for (const route of flatSteps) {
        const laborHours = demand * route.laborHoursPerUnit;
        if (laborHours === 0) continue;

        const assignedShift = shifts[0];
        const shiftHours = assignedShift
          ? shiftDurationHours(assignedShift.startTime, assignedShift.endTime)
          : 8;

        const hoursPerPersonPerMonth = shiftHours * workingDays;
        const headcount = hoursPerPersonPerMonth > 0
          ? Math.ceil(laborHours / hoursPerPersonPerMonth)
          : 1;

        productionPlans.push({
          equipmentId: equip.id,
          equipmentCode: equip.code,
          equipmentName: equip.name,
          subProcessId: route.subProcessId,
          subProcessName: route.subProcessName,
          shiftId: assignedShift?.id,
          shiftName: assignedShift?.name,
          month: period.month,
          year: period.year,
          unitsToProcess: demand,
          laborHoursRequired: laborHours,
          headcountRequired: headcount,
          isSpecialist: route.requiresSpecialist,
        });

        const totalCapacityHours = shifts.reduce((sum: number, s: { startTime: string; endTime: string }) => {
          return sum + shiftDurationHours(s.startTime, s.endTime) * workingDays;
        }, 0);

        const maxThroughput =
          route.capacityPerHour * totalCapacityHours;

        if (demand > maxThroughput && maxThroughput > 0) {
          alerts.push({
            type: 'CAPACITY',
            severity: 'critical',
            message: `${route.subProcessName} para ${equip.name}: ${demand} unidades necesarias pero capacidad máxima es ${Math.floor(maxThroughput)} unidades en todos los turnos (${period.month}/${period.year}).`,
            month: period.month,
            year: period.year,
            relatedId: equip.id,
          });
        } else if (laborHours > totalCapacityHours && totalCapacityHours > 0) {
          alerts.push({
            type: 'CAPACITY',
            severity: 'critical',
            message: `${route.subProcessName} para ${equip.name}: ${laborHours.toFixed(0)}h de trabajo necesarias pero solo ${totalCapacityHours.toFixed(0)}h disponibles en todos los turnos (${period.month}/${period.year}).`,
            month: period.month,
            year: period.year,
            relatedId: equip.id,
          });
        }
      }
    }
  }

  return { purchasePlans, productionPlans, alerts };
}
