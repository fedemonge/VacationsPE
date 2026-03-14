import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function calculateValues(months: number[]) {
  const effectiveValue = months.reduce((a, b) => a + b, 0);
  const nonZeroMonths = months.filter((v) => v !== 0).length;
  const annualizedValue =
    nonZeroMonths > 0 ? (effectiveValue / nonZeroMonths) * 12 : 0;
  return { effectiveValue, annualizedValue };
}

function getMonthValues(body: Record<string, unknown>): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const val = body[`month${i + 1}Value`];
    return typeof val === "number" ? val : 0;
  });
}

function getMonthUsdValues(body: Record<string, unknown>): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const val = body[`month${i + 1}Usd`];
    return typeof val === "number" ? val : 0;
  });
}

async function convertToUsd(
  months: number[],
  projectCurrency: string,
  implementationDate: string | null
): Promise<number[]> {
  if (projectCurrency === "USD") return [...months];

  // Determine the starting year-month from implementation date or current date
  const baseDate = implementationDate ? new Date(implementationDate) : new Date();
  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth() + 1; // 1-based

  // Fetch all exchange rates for this currency
  const rates = await prisma.fecExchangeRate.findMany({
    where: { currency: projectCurrency },
  });

  // Build lookup: "YYYY-MM" -> rateToUsd
  const rateLookup: Record<string, number> = {};
  for (const r of rates) {
    rateLookup[`${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`] = r.rateToUsd;
  }

  // Convert each month
  return months.map((val, i) => {
    const monthOffset = i;
    const totalMonths = (startYear * 12 + startMonth - 1) + monthOffset;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const rate = rateLookup[key];
    if (rate && val !== 0) {
      return Math.round(val * rate * 100) / 100;
    }
    // If no rate found, try the closest available rate for that currency
    if (val !== 0 && rates.length > 0) {
      // Use the most recent rate as fallback
      const sorted = [...rates].sort(
        (a, b) => (b.periodYear * 100 + b.periodMonth) - (a.periodYear * 100 + a.periodMonth)
      );
      return Math.round(val * sorted[0].rateToUsd * 100) / 100;
    }
    return 0;
  });
}

async function generateCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FEC-${year}-`;

  const lastIdea = await prisma.fecIdea.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });

  let seq = 1;
  if (lastIdea) {
    const lastSeq = parseInt(lastIdea.code.split("-")[2], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const areaId = searchParams.get("areaId");
    const leadEmployeeId = searchParams.get("leadEmployeeId");
    const companyId = searchParams.get("companyId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (areaId) where.areaId = areaId;
    if (leadEmployeeId) where.leadEmployeeId = leadEmployeeId;
    if (companyId) where.companyId = companyId;

    const ideas = await prisma.fecIdea.findMany({
      where,
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ideas });
  } catch (error) {
    console.error("[FEC_IDEAS] ERROR GET:", error);
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
    const {
      title,
      description,
      ideaType,
      areaId,
      leadEmployeeId,
      companyId,
      projectCurrency,
      plLine,
      bsLine,
      cfLine,
      implementationDate,
      revisedImplementationDate,
    } = body;

    // Validate required fields
    if (!title || !description || !ideaType || !areaId || !leadEmployeeId || !companyId) {
      return NextResponse.json(
        { error: "title, description, ideaType, areaId, leadEmployeeId y companyId son obligatorios" },
        { status: 400 }
      );
    }

    const validTypes = ["AHORRO", "USO"];
    if (!validTypes.includes(ideaType)) {
      return NextResponse.json(
        { error: "ideaType debe ser AHORRO o USO" },
        { status: 400 }
      );
    }

    // Validate area exists
    const area = await prisma.fecArea.findUnique({ where: { id: areaId } });
    if (!area) {
      return NextResponse.json(
        { error: "Área no encontrada" },
        { status: 404 }
      );
    }

    // Validate company exists
    const company = await prisma.fecCompany.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json(
        { error: "Empresa no encontrada" },
        { status: 404 }
      );
    }

    // Validate lead employee exists
    const leadEmployee = await prisma.employee.findUnique({
      where: { id: leadEmployeeId },
    });
    if (!leadEmployee) {
      return NextResponse.json(
        { error: "Empleado líder no encontrado" },
        { status: 404 }
      );
    }

    // Get creator info
    const creator = await prisma.employee.findFirst({
      where: { email: session.email },
    });

    // Process local currency month values
    let months = getMonthValues(body);

    // For USO type, ensure all values are negative
    if (ideaType === "USO") {
      months = months.map((v) => (v > 0 ? -Math.abs(v) : v));
    }

    const { effectiveValue, annualizedValue } = calculateValues(months);

    // Auto-calculate USD from exchange rates
    const monthsUsd = await convertToUsd(
      months,
      projectCurrency || "USD",
      implementationDate || null
    );

    const { effectiveValue: effectiveValueUsd, annualizedValue: annualizedValueUsd } =
      calculateValues(monthsUsd);

    // Auto-generate code
    const code = await generateCode();

    const idea = await prisma.fecIdea.create({
      data: {
        code,
        title,
        description,
        ideaType,
        status: "ESTUDIAR",
        areaId,
        companyId,
        leadEmployeeId,
        projectCurrency: projectCurrency || "USD",
        plLine: plLine || null,
        bsLine: bsLine || null,
        cfLine: cfLine || null,
        implementationDate: implementationDate
          ? new Date(implementationDate)
          : null,
        revisedImplementationDate: revisedImplementationDate
          ? new Date(revisedImplementationDate)
          : null,
        month1Value: months[0],
        month2Value: months[1],
        month3Value: months[2],
        month4Value: months[3],
        month5Value: months[4],
        month6Value: months[5],
        month7Value: months[6],
        month8Value: months[7],
        month9Value: months[8],
        month10Value: months[9],
        month11Value: months[10],
        month12Value: months[11],
        annualizedValue,
        effectiveValue,
        month1Usd: monthsUsd[0],
        month2Usd: monthsUsd[1],
        month3Usd: monthsUsd[2],
        month4Usd: monthsUsd[3],
        month5Usd: monthsUsd[4],
        month6Usd: monthsUsd[5],
        month7Usd: monthsUsd[6],
        month8Usd: monthsUsd[7],
        month9Usd: monthsUsd[8],
        month10Usd: monthsUsd[9],
        month11Usd: monthsUsd[10],
        month12Usd: monthsUsd[11],
        annualizedValueUsd,
        effectiveValueUsd,
        analystApprovalRequired: ideaType === "USO",
        createdByEmail: session.email,
        createdByName: creator?.fullName || session.email,
      },
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
    });

    console.log(
      `[FEC_IDEAS] CREADA: ${idea.code} - ${idea.title} (${ideaType}) - Área: ${area.name} - Empresa: ${company.name}`
    );

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    console.error("[FEC_IDEAS] ERROR POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
