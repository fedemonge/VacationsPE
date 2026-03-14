import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const DOC_TYPE_MAP: Record<string, string> = {
  DNI: "1",
  CE: "4",
  PASAPORTE: "7",
};

/**
 * GET /api/planilla/batches/[id]/bbva — Generate BBVA bank file
 * Only for APROBADO or PAGADO batches.
 * Returns a pipe-delimited TXT file for BBVA Peru "Envío Directo" format.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const batch = await prisma.payrollBatch.findUnique({
    where: { id: params.id },
    include: {
      period: true,
      details: {
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              documentType: true,
              documentNumber: true,
              bankName: true,
              bankAccountNumber: true,
            },
          },
        },
        where: { isExcluded: false },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  if (!["APROBADO", "PAGADO"].includes(batch.status)) {
    return NextResponse.json(
      { error: "Solo se puede generar el archivo para lotes APROBADOS o PAGADOS" },
      { status: 400 }
    );
  }

  // Load company config
  const rucConfig = await prisma.systemConfiguration.findUnique({ where: { key: "BBVA_RUC_EMPRESA" } });
  const rsConfig = await prisma.systemConfiguration.findUnique({ where: { key: "BBVA_RAZON_SOCIAL" } });

  const ruc = rucConfig?.value || "00000000000";
  const razonSocial = rsConfig?.value || "EMPRESA";
  const paymentDate = batch.period.paymentDate
    ? formatDate(new Date(batch.period.paymentDate))
    : formatDate(new Date());
  const batchRef = `LOTE-${batch.batchNumber}-${batch.period.periodYear}${String(batch.period.periodMonth).padStart(2, "0")}`;
  const currency = "PEN";

  const lines: string[] = [];

  // Header
  const totalRecords = batch.details.length;
  const totalAmount = batch.details.reduce((s, d) => s + d.netoAPagar, 0);
  lines.push(
    `H|${ruc}|${razonSocial}|${paymentDate}|${batchRef}|${totalRecords}|${totalAmount.toFixed(2)}|${currency}`
  );

  // Detail lines
  for (const detail of batch.details) {
    const emp = detail.employee;
    const docType = DOC_TYPE_MAP[emp.documentType || "DNI"] || "1";
    const docNumber = emp.documentNumber || "";
    const employeeName = emp.fullName.substring(0, 40);
    const accountNumber = emp.bankAccountNumber || "";
    const amount = detail.netoAPagar.toFixed(2);

    lines.push(
      `D|${docType}|${docNumber}|${employeeName}|${accountNumber}|${amount}|${currency}|PAGO DE HABERES`
    );
  }

  // Trailer
  lines.push(`T|${totalRecords}|${totalAmount.toFixed(2)}`);

  const content = lines.join("\r\n");
  const fileName = `BBVA_${batchRef}.txt`;

  // Update batch with file info
  await prisma.payrollBatch.update({
    where: { id: params.id },
    data: {
      bbvaFileName: fileName,
      bbvaFileGeneratedAt: new Date(),
      bbvaFileGeneratedBy: session.email,
    },
  });

  console.log(`[BATCHES] BBVA file generated: ${fileName} by ${session.email}`);

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
