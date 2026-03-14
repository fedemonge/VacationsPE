import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency");
    const year = searchParams.get("year");

    const where: Record<string, unknown> = {};
    if (currency) where.currency = currency;
    if (year) where.periodYear = parseInt(year, 10);

    const rates = await prisma.fecExchangeRate.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "asc" }, { currency: "asc" }],
    });

    return NextResponse.json({ rates });
  } catch (error) {
    console.error("[FEC_EXCHANGE_RATES] ERROR GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currency, periodYear, periodMonth, rateToUsd } = body;

    if (!currency || !periodYear || !periodMonth || rateToUsd === undefined) {
      return NextResponse.json(
        { error: "currency, periodYear, periodMonth y rateToUsd son obligatorios" },
        { status: 400 }
      );
    }

    if (periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json(
        { error: "periodMonth debe estar entre 1 y 12" },
        { status: 400 }
      );
    }

    if (typeof rateToUsd !== "number" || rateToUsd <= 0) {
      return NextResponse.json(
        { error: "rateToUsd debe ser un número positivo" },
        { status: 400 }
      );
    }

    const rate = await prisma.fecExchangeRate.upsert({
      where: {
        currency_periodYear_periodMonth: {
          currency,
          periodYear,
          periodMonth,
        },
      },
      update: {
        rateToUsd,
      },
      create: {
        currency,
        periodYear,
        periodMonth,
        rateToUsd,
      },
    });

    console.log(
      `[FEC_EXCHANGE_RATES] UPSERT: ${currency} ${periodYear}-${String(periodMonth).padStart(2, "0")} = ${rateToUsd}`
    );

    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error("[FEC_EXCHANGE_RATES] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
