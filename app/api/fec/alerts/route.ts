import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const ideas = await prisma.fecIdea.findMany({
      where: {
        status: "FIRME",
        OR: [
          {
            revisedImplementationDate: { gte: now, lte: thirtyDays },
          },
          {
            revisedImplementationDate: null,
            implementationDate: { gte: now, lte: thirtyDays },
          },
        ],
      },
      include: {
        area: { select: { id: true, name: true } },
        leadEmployee: { select: { id: true, fullName: true, email: true } },
        company: { select: { id: true, name: true, code: true, currency: true } },
      },
      orderBy: { implementationDate: "asc" },
    });

    // Group by leader with email addresses
    const grouped: Record<
      string,
      {
        leader: { id: string; fullName: string; email: string };
        ideas: {
          id: string;
          code: string;
          title: string;
          ideaType: string;
          implementationDate: Date | null;
          revisedImplementationDate: Date | null;
          effectiveValue: number;
          annualizedValue: number;
          effectiveValueUsd: number;
          annualizedValueUsd: number;
          areaName: string;
          companyName: string;
          companyCode: string;
        }[];
      }
    > = {};

    for (const idea of ideas) {
      const leadId = idea.leadEmployee.id;
      if (!grouped[leadId]) {
        grouped[leadId] = { leader: idea.leadEmployee, ideas: [] };
      }
      grouped[leadId].ideas.push({
        id: idea.id,
        code: idea.code,
        title: idea.title,
        ideaType: idea.ideaType,
        implementationDate: idea.implementationDate,
        revisedImplementationDate: idea.revisedImplementationDate,
        effectiveValue: idea.effectiveValue,
        annualizedValue: idea.annualizedValue,
        effectiveValueUsd: idea.effectiveValueUsd,
        annualizedValueUsd: idea.annualizedValueUsd,
        areaName: idea.area.name,
        companyName: idea.company.name,
        companyCode: idea.company.code,
      });
    }

    return NextResponse.json({
      alertDate: now.toISOString(),
      dueWithin30Days: Object.values(grouped),
      totalIdeas: ideas.length,
      totalLeaders: Object.keys(grouped).length,
    });
  } catch (error) {
    console.error("[FEC_ALERTS] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
