/**
 * Odoo CSV journal entry export for payroll periods.
 * Generates a CSV file compatible with Odoo's standard journal import format.
 * Accounts follow Peru's PCGE (Plan Contable General Empresarial).
 */

interface OdooAccountRule {
  debitAccount: string | null;
  creditAccount: string | null;
  label: string;
}

const CONCEPT_ACCOUNT_MAP: Record<string, OdooAccountRule> = {
  // Remuneraciones → Gasto 6211 / Por pagar 4111
  SUELDO_BASICO: { debitAccount: "6211", creditAccount: null, label: "Sueldos" },
  ASIG_FAMILIAR: { debitAccount: "6211", creditAccount: null, label: "Asignación Familiar" },
  HE_25: { debitAccount: "6211", creditAccount: null, label: "Horas Extra 25%" },
  HE_35: { debitAccount: "6211", creditAccount: null, label: "Horas Extra 35%" },
  HE_100: { debitAccount: "6211", creditAccount: null, label: "Horas Extra 100%" },
  COMISION: { debitAccount: "6211", creditAccount: null, label: "Comisiones" },

  // Gratificación
  GRATIFICACION: { debitAccount: "6214", creditAccount: "4114", label: "Gratificación" },
  BONIF_EXTRA: { debitAccount: "6215", creditAccount: "4115", label: "Bonificación Extraordinaria" },

  // Descuentos tardanza/faltas reducen el gasto bruto (no generan asiento separado)
  DESC_TARDANZA: { debitAccount: null, creditAccount: "6211", label: "Descuento Tardanzas" },
  DESC_FALTAS: { debitAccount: null, creditAccount: "6211", label: "Descuento Faltas" },

  // Retenciones del empleado → solo crédito a pasivo
  ONP: { debitAccount: null, creditAccount: "4032", label: "ONP por Pagar" },
  AFP_FONDO: { debitAccount: null, creditAccount: "4033", label: "AFP Fondo por Pagar" },
  AFP_SEGURO: { debitAccount: null, creditAccount: "4033", label: "AFP Seguro por Pagar" },
  AFP_COMISION: { debitAccount: null, creditAccount: "4033", label: "AFP Comisión por Pagar" },
  RENTA_5TA: { debitAccount: null, creditAccount: "4017", label: "Renta 5ta Categoría" },

  // Aportes empleador
  ESSALUD: { debitAccount: "6271", creditAccount: "4031", label: "EsSalud" },

  // Provisiones
  PROV_VACACIONES: { debitAccount: "6215", creditAccount: "4115", label: "Provisión Vacaciones" },
  PROV_CTS: { debitAccount: "6291", creditAccount: "4151", label: "Provisión CTS" },
  PROV_GRATIFICACION: { debitAccount: "6214", creditAccount: "4114", label: "Provisión Gratificación" },
};

export interface OdooLineInput {
  conceptCode: string;
  amount: number;
  costCenter: string;
}

export interface OdooExportInput {
  periodLabel: string;
  periodEndDate: string;
  lines: OdooLineInput[];
  netoByCC: Array<{ costCenter: string; totalNeto: number }>;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface AggKey {
  account: string;
  costCenter: string;
  label: string;
  side: "debit" | "credit";
}

export function generateOdooCSV(input: OdooExportInput): string {
  const ref = `NOM-${input.periodLabel}`;
  const date = input.periodEndDate.slice(0, 10);

  // Aggregate amounts by (account, costCenter, side)
  const agg = new Map<string, { key: AggKey; amount: number }>();

  function addEntry(key: AggKey, amount: number) {
    const mapKey = `${key.account}|${key.costCenter}|${key.label}|${key.side}`;
    const existing = agg.get(mapKey);
    if (existing) {
      existing.amount += amount;
    } else {
      agg.set(mapKey, { key, amount });
    }
  }

  for (const line of input.lines) {
    const rule = CONCEPT_ACCOUNT_MAP[line.conceptCode];
    if (!rule) continue;

    if (rule.debitAccount) {
      addEntry(
        { account: rule.debitAccount, costCenter: line.costCenter, label: rule.label, side: "debit" },
        line.amount
      );
    }
    if (rule.creditAccount) {
      addEntry(
        { account: rule.creditAccount, costCenter: line.costCenter, label: rule.label, side: "credit" },
        line.amount
      );
    }
  }

  // Neto a pagar → crédito 4111 por centro de costo
  for (const { costCenter, totalNeto } of input.netoByCC) {
    addEntry(
      { account: "4111", costCenter, label: "Remuneraciones por Pagar", side: "credit" },
      totalNeto
    );
  }

  const rows: string[] = [];
  rows.push("journal,date,ref,account_code,partner,name,debit,credit,analytic_account");

  for (const [, entry] of Array.from(agg)) {
    const { key, amount } = entry;
    if (Math.abs(amount) < 0.01) continue;

    const amt = Math.abs(amount).toFixed(2);
    const name = csvEscape(`${key.label} - CC ${key.costCenter}`);
    const debit = key.side === "debit" ? amt : "0.00";
    const credit = key.side === "credit" ? amt : "0.00";

    rows.push(
      `NOM,${date},${ref},${key.account},,${name},${debit},${credit},${key.costCenter}`
    );
  }

  return rows.join("\n");
}
