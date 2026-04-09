import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FAULT_CODES } from "@/lib/remanufactura/types";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const numeroSerie = searchParams.get("numeroSerie")?.trim();

  if (!numeroSerie) {
    return NextResponse.json({ error: "numeroSerie es requerido" }, { status: 400 });
  }

  try {
    const SOURCE_CUTOFF = new Date(Date.UTC(2025, 6, 1));

    // OSCM before July 1 2025, WMS from July 1 2025. No exceptions.
    const transactions = await prisma.remanufacturaTransaccion.findMany({
      where: {
        numeroSerie,
        OR: [
          { fechaTransaccion: { lt: SOURCE_CUTOFF }, source: "OSCM" },
          { fechaTransaccion: { gte: SOURCE_CUTOFF }, source: "WMS" },
        ],
      },
      orderBy: { fechaTransaccion: "asc" },
    });
    const allTransactions = transactions;

    if (transactions.length === 0) {
      return NextResponse.json({ totalTransacciones: 0 });
    }

    const first = transactions[0];
    const last = transactions[transactions.length - 1];

    let sinFalla = 0;
    let conFalla = 0;
    let sinDiagnostico = 0;
    let totalOSCM = 0;
    let totalWMS = 0;

    const mapped = transactions.map((t) => {
      if (t.resultadoDiagnostico === "SIN_FALLA") sinFalla++;
      else if (t.resultadoDiagnostico === "CON_FALLA") conFalla++;
      else sinDiagnostico++;

      if (t.source === "OSCM") totalOSCM++;
      else totalWMS++;

      const fallaCode = t.falla || "";
      const showFalla = t.resultadoDiagnostico === "SIN_FALLA" ? "" : fallaCode;

      return {
        id: t.id,
        fecha: t.fechaTransaccion ? new Date(t.fechaTransaccion).toISOString().split("T")[0] : "—",
        source: t.source,
        etapa: t.etapa || "",
        tipoTransaccion: t.tipoTransaccion || "",
        falla: showFalla,
        fallaDescripcion: showFalla ? (FAULT_CODES[showFalla] || showFalla) : "",
        resultadoDiagnostico: t.resultadoDiagnostico || "",
        orgOrigen: t.orgOrigen || "",
        orgDestino: t.orgDestino || "",
        subinvOrigen: t.subinvOrigen || "",
        subinvDestino: t.subinvDestino || "",
        estado: t.estado || "",
        familiaEquipo: t.familiaEquipo || "",
        usuario: t.usuario || "",
      };
    });

    // Detect client to apply correct cycle-entry logic
    const isDirectv = transactions.some((t) => t.clienteNormalizado === "DIRECTV");

    // Assign cycle numbers based on distinct cycle-entry dates from ALL sources.
    // DirecTV: 'Recepciones Varias'/'Transferencia Directa Entre Organizaciones' + orgDestino IQREC00*
    // Other clients: etapa INGRESO + 'Recepciones varias'
    // WMS (all): DIAGNOSTICO
    const ingresoDates = new Set<string>();
    for (const t of allTransactions) {
      if (!t.fechaTransaccion) continue;
      const isCycleEntry = isDirectv
        ? (
            ((t.tipoTransaccion === "Recepciones Varias" || t.tipoTransaccion === "Recepciones varias" || t.tipoTransaccion === "Transferencia Directa Entre Organizaciones") && t.orgDestino?.startsWith("IQREC00"))
            || (t.source === "WMS" && t.etapa === "DIAGNOSTICO")
          )
        : (
            (t.etapa === "INGRESO" && t.tipoTransaccion === "Recepciones varias")
            || (t.source === "WMS" && t.etapa === "DIAGNOSTICO")
          );
      if (isCycleEntry) {
        ingresoDates.add(new Date(t.fechaTransaccion).toISOString().split("T")[0]);
      }
    }
    const sortedIngresoDates = Array.from(ingresoDates).sort();
    const totalCycles = sortedIngresoDates.length;

    // For each transaction, determine which cycle it belongs to
    // (the most recent INGRESO date that is <= the transaction date)
    for (let i = 0; i < mapped.length; i++) {
      const txDate = mapped[i].fecha;
      let cycleNum = 0;
      for (let j = sortedIngresoDates.length - 1; j >= 0; j--) {
        if (sortedIngresoDates[j] <= txDate) {
          cycleNum = j + 1;
          break;
        }
      }
      (mapped[i] as Record<string, unknown>).ciclo = cycleNum;
      const t2 = transactions[i];
      (mapped[i] as Record<string, unknown>).esIngreso = isDirectv
        ? (
            ((t2.tipoTransaccion === "Recepciones Varias" || t2.tipoTransaccion === "Recepciones varias" || t2.tipoTransaccion === "Transferencia Directa Entre Organizaciones") && t2.orgDestino?.startsWith("IQREC00"))
            || (t2.source === "WMS" && t2.etapa === "DIAGNOSTICO")
          )
        : (
            (t2.etapa === "INGRESO" && t2.tipoTransaccion === "Recepciones varias")
            || (t2.source === "WMS" && t2.etapa === "DIAGNOSTICO")
          );
    }

    // Determine familia from the most common non-null value
    const familias = transactions.map((t) => t.familiaEquipo).filter(Boolean);
    const familia = familias.length > 0
      ? familias.sort((a, b) =>
          familias.filter((v) => v === b).length - familias.filter((v) => v === a).length
        )[0]
      : "—";

    const cliente = transactions.find((t) => t.clienteNormalizado)?.clienteNormalizado || "—";

    return NextResponse.json({
      numeroSerie,
      totalTransacciones: transactions.length,
      familia,
      cliente,
      primerIngreso: first.fechaTransaccion ? new Date(first.fechaTransaccion).toISOString().split("T")[0] : "—",
      ultimoIngreso: last.fechaTransaccion ? new Date(last.fechaTransaccion).toISOString().split("T")[0] : "—",
      totalOSCM,
      totalWMS,
      totalCycles,
      diagnosticos: { sinFalla, conFalla, sinDiagnostico },
      transactions: mapped,
    });
  } catch (error) {
    console.error("[SERIE DETAIL] ERROR:", error);
    return NextResponse.json({ error: "Error al buscar serie" }, { status: 500 });
  }
}
