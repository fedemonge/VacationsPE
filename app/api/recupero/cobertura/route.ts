import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRecuperoTables } from "@/lib/recupero/ensure-tables";

export const dynamic = "force-dynamic";

/**
 * GET /api/recupero/cobertura
 * Coverage report based on field service data (RecuperoImport → RecuperoTask).
 * Shows: per-import stats, visit attempts per customer, recovery effectiveness.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await ensureRecuperoTables();

  // 1. Load all field service imports
  const imports = await prisma.recuperoImport.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      source: true,
      totalRows: true,
      importedRows: true,
      errorRows: true,
      importedByName: true,
      createdAt: true,
    },
  });

  // 2. Load all tasks with key fields
  const allTasks = await prisma.recuperoTask.findMany({
    select: {
      id: true,
      importId: true,
      cedulaUsuario: true,
      contrato: true,
      nombreUsuario: true,
      departamento: true,
      tipoCierre: true,
      fechaCierre: true,
      equiposRecuperados: true,
      esQuemada: true,
      agenteCampo: true,
    },
  });

  // 3. Group tasks by customer (cedulaUsuario) to count visits per customer
  const customerMap = new Map<string, {
    visits: number;
    recoveredVisits: number;
    failedVisits: number;
    burnedVisits: number;
    equiposRecuperados: number;
    firstVisit: Date | null;
    lastVisit: Date | null;
    lastStatus: string;
    nombreUsuario: string;
    departamento: string;
    agentes: Set<string>;
    imports: Set<string>;
  }>();

  for (const t of allTasks) {
    const key = t.cedulaUsuario || t.contrato || t.id; // fallback key
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        visits: 0,
        recoveredVisits: 0,
        failedVisits: 0,
        burnedVisits: 0,
        equiposRecuperados: 0,
        firstVisit: null,
        lastVisit: null,
        lastStatus: "",
        nombreUsuario: t.nombreUsuario || "",
        departamento: t.departamento || "",
        agentes: new Set(),
        imports: new Set(),
      });
    }
    const c = customerMap.get(key)!;
    c.visits++;
    if (t.importId) c.imports.add(t.importId);
    if (t.agenteCampo) c.agentes.add(t.agenteCampo);
    if (t.tipoCierre === "RECUPERADO WODEN") {
      c.recoveredVisits++;
    } else {
      c.failedVisits++;
    }
    if (t.esQuemada) c.burnedVisits++;
    c.equiposRecuperados += t.equiposRecuperados || 0;

    // Keep latest nombre/departamento
    if (t.nombreUsuario) c.nombreUsuario = t.nombreUsuario;
    if (t.departamento) c.departamento = t.departamento;

    const fecha = t.fechaCierre;
    if (fecha) {
      if (!c.firstVisit || fecha < c.firstVisit) c.firstVisit = fecha;
      if (!c.lastVisit || fecha > c.lastVisit) {
        c.lastVisit = fecha;
        c.lastStatus = t.tipoCierre || "";
      }
    }
  }

  // 4. Build visit attempt histogram (how many customers have 1, 2, 3... visits)
  const attemptHistogram = new Map<number, number>();
  let totalCustomers = 0;
  let customersRecovered = 0;
  let customersMultiVisit = 0;
  let customersSingleVisit = 0;
  let customersNeverRecovered = 0;

  for (const [, c] of Array.from(customerMap)) {
    totalCustomers++;
    attemptHistogram.set(c.visits, (attemptHistogram.get(c.visits) || 0) + 1);
    if (c.recoveredVisits > 0) customersRecovered++;
    else customersNeverRecovered++;
    if (c.visits > 1) customersMultiVisit++;
    else customersSingleVisit++;
  }

  const attemptDistribution = Array.from(attemptHistogram.entries())
    .map(([visits, count]) => ({ visits, count }))
    .sort((a, b) => a.visits - b.visits);

  // 5. Per-import breakdown
  const perImport = imports.map((imp) => {
    const impTasks = allTasks.filter((t) => t.importId === imp.id);
    const impTotal = impTasks.length;
    const impExitosas = impTasks.filter((t) => t.tipoCierre === "RECUPERADO WODEN").length;
    const impFallidas = impTotal - impExitosas;
    const impQuemadas = impTasks.filter((t) => t.esQuemada).length;
    const impEquipos = impTasks.reduce((s, t) => s + (t.equiposRecuperados || 0), 0);

    // Unique customers in this import
    const impCustomers = new Set(impTasks.map((t) => t.cedulaUsuario || t.contrato || t.id));

    // For each customer in this import, how many TOTAL visits across ALL imports
    const impCustomerVisitCounts: number[] = [];
    for (const cid of Array.from(impCustomers)) {
      const c = customerMap.get(cid);
      if (c) impCustomerVisitCounts.push(c.visits);
    }

    // Visit distribution for this import's customers
    const impAttemptMap = new Map<number, number>();
    for (const v of impCustomerVisitCounts) {
      impAttemptMap.set(v, (impAttemptMap.get(v) || 0) + 1);
    }

    // Customers with only 1 visit vs multiple
    const impSingleVisit = impCustomerVisitCounts.filter((v) => v === 1).length;
    const impMultiVisit = impCustomerVisitCounts.filter((v) => v > 1).length;

    // Dates range
    const impDates = impTasks
      .map((t) => t.fechaCierre)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      importId: imp.id,
      fileName: imp.fileName,
      source: imp.source,
      importDate: imp.createdAt.toISOString(),
      importedBy: imp.importedByName || "",
      totalTasks: impTotal,
      exitosas: impExitosas,
      fallidas: impFallidas,
      quemadas: impQuemadas,
      equiposRecuperados: impEquipos,
      effectivenessPct: impTotal > 0 ? Math.round((impExitosas / impTotal) * 1000) / 10 : 0,
      uniqueCustomers: impCustomers.size,
      customersSingleVisit: impSingleVisit,
      customersMultiVisit: impMultiVisit,
      dateFrom: impDates.length > 0 ? impDates[0].toISOString() : null,
      dateTo: impDates.length > 0 ? impDates[impDates.length - 1].toISOString() : null,
      attemptDistribution: Array.from(impAttemptMap.entries())
        .map(([visits, count]) => ({ visits, count }))
        .sort((a, b) => a.visits - b.visits),
    };
  });

  // 6. All customers (for drilldown by visit count)
  const allCustomers = Array.from(customerMap.entries())
    .sort((a, b) => b[1].visits - a[1].visits)
    .map(([customerId, c]) => ({
      customerId,
      nombreUsuario: c.nombreUsuario,
      departamento: c.departamento,
      agentes: Array.from(c.agentes),
      visits: c.visits,
      recoveredVisits: c.recoveredVisits,
      failedVisits: c.failedVisits,
      burnedVisits: c.burnedVisits,
      equiposRecuperados: c.equiposRecuperados,
      firstVisit: c.firstVisit?.toISOString() || null,
      lastVisit: c.lastVisit?.toISOString() || null,
      lastStatus: c.lastStatus,
      appearsInImports: c.imports.size,
    }));

  return NextResponse.json({
    summary: {
      totalImports: imports.length,
      totalTasks: allTasks.length,
      totalCustomers,
      customersRecovered,
      customersNeverRecovered,
      customersSingleVisit,
      customersMultiVisit,
      recoveryPct: totalCustomers > 0 ? Math.round((customersRecovered / totalCustomers) * 1000) / 10 : 0,
      totalEquipos: allTasks.reduce((s, t) => s + (t.equiposRecuperados || 0), 0),
    },
    attemptDistribution,
    perImport,
    allCustomers,
  });
}
