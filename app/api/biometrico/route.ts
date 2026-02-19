import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un array de registros biométricos" },
        { status: 400 }
      );
    }

    let imported = 0;
    let errors = 0;

    for (const record of records) {
      try {
        const employee = await prisma.employee.findUnique({
          where: { employeeCode: record.employeeCode },
        });

        if (!employee) {
          errors++;
          continue;
        }

        await prisma.biometricRecord.create({
          data: {
            employeeId: employee.id,
            employeeCode: record.employeeCode,
            date: new Date(record.date),
            clockIn: record.clockIn ? new Date(record.clockIn) : null,
            clockOut: record.clockOut ? new Date(record.clockOut) : null,
            absenceType: record.absenceType || null,
            source: record.source || "BIOMETRICO",
          },
        });
        imported++;
      } catch {
        errors++;
      }
    }

    console.log(`[BIOMETRICO] IMPORTACION: ${imported} registros importados, ${errors} errores`);

    return NextResponse.json({ imported, errors });
  } catch (error) {
    console.error("[BIOMETRICO] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar registros biométricos" },
      { status: 500 }
    );
  }
}
