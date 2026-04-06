import type { MrpAlert } from './calculator';

export interface SupplierRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SupplierItemWithSupplier {
  id: string;
  unitCost: number;
  moq: number;
  isPreferred: boolean;
  purchaseUnitQty: number;
  supplier: SupplierRef;
}

export interface SupplierSelectionResult {
  supplier: SupplierRef | null;
  supplierItem: SupplierItemWithSupplier | null;
  alert: MrpAlert | null;
}

/**
 * Selects the best supplier for a component purchase.
 *
 * Priority:
 *   1. Preferred supplier with active status that can deliver in time
 *   2. Any active supplier that can deliver in time (shortest lead time, then lowest cost)
 *   3. Preferred supplier even if lead time is too long (with alert)
 *   4. Any supplier (with alert)
 *   5. No supplier at all (with critical alert)
 */
export function selectSupplier(
  supplierItems: SupplierItemWithSupplier[],
  quantityNeeded: number,
  deliveryDate: Date,
  componentName: string,
  month: number,
  year: number,
  relatedId: string,
  materialLeadTimeDays: number = 0
): SupplierSelectionResult {
  const activeItems = supplierItems.filter((si) => si.supplier.isActive);

  if (activeItems.length === 0) {
    if (supplierItems.length > 0) {
      return {
        supplier: null,
        supplierItem: null,
        alert: {
          type: 'NO_SUPPLIER',
          severity: 'critical',
          message: `Sin proveedor activo para "${componentName}". ${supplierItems.length} proveedor(es) existen pero están inactivos.`,
          month,
          year,
          relatedId,
        },
      };
    }
    return {
      supplier: null,
      supplierItem: null,
      alert: {
        type: 'NO_SUPPLIER',
        severity: 'critical',
        message: `Sin proveedor configurado para "${componentName}". No se puede cumplir el plan de compras.`,
        month,
        year,
        relatedId,
      },
    };
  }

  // Sort: preferred first, then lowest unit cost
  const sorted = [...activeItems].sort((a, b) => {
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    return a.unitCost - b.unitCost;
  });

  const now = new Date();

  // Check if the material's lead time allows delivery in time
  const orderDate = new Date(deliveryDate);
  orderDate.setDate(orderDate.getDate() - materialLeadTimeDays);

  if (orderDate >= now) {
    // Lead time is fine — return the best (preferred/cheapest) supplier
    return {
      supplier: sorted[0].supplier,
      supplierItem: sorted[0],
      alert: null,
    };
  }

  // Lead time issue — still return the best supplier but with an alert
  const bestItem = sorted[0];
  const daysLate = Math.ceil(
    (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    supplier: bestItem.supplier,
    supplierItem: bestItem,
    alert: {
      type: 'LEAD_TIME',
      severity: daysLate > 30 ? 'critical' : 'warning',
      message: `Problema de lead time para "${componentName}" (${bestItem.supplier.name}): orden necesaria hace ${daysLate} día(s) para entrega en ${month}/${year}. Lead time del material: ${materialLeadTimeDays} días.`,
      month,
      year,
      relatedId,
    },
  };
}
