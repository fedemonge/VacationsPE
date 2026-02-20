import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un archivo" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "El archivo debe tener al menos una fila de encabezado y una de datos" },
        { status: 400 }
      );
    }

    // Skip header row
    const dataLines = lines.slice(1);
    let imported = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const line of dataLines) {
      const fields = line.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));

      if (fields.length < 8) {
        errors++;
        errorDetails.push(`Fila con campos insuficientes: ${line.substring(0, 50)}...`);
        continue;
      }

      const [employeeCode, fullName, email, hireDate, terminationDate, costCenter, costCenterDesc, supervisorName, supervisorEmail, position] = fields;

      if (!employeeCode || !fullName || !email || !hireDate) {
        errors++;
        errorDetails.push(`Campos obligatorios faltantes para: ${employeeCode || "sin código"}`);
        continue;
      }

      try {
        const termDate = terminationDate && terminationDate.trim() ? new Date(terminationDate) : null;
        await prisma.employee.upsert({
          where: { employeeCode },
          update: {
            fullName,
            email,
            hireDate: new Date(hireDate),
            terminationDate: termDate,
            costCenter: costCenter || "",
            costCenterDesc: costCenterDesc || "",
            supervisorName: supervisorName || "",
            supervisorEmail: supervisorEmail || "",
            position: position || "",
          },
          create: {
            employeeCode,
            fullName,
            email,
            hireDate: new Date(hireDate),
            terminationDate: termDate,
            costCenter: costCenter || "",
            costCenterDesc: costCenterDesc || "",
            supervisorName: supervisorName || "",
            supervisorEmail: supervisorEmail || "",
            position: position || "",
          },
        });
        imported++;
      } catch {
        errors++;
        errorDetails.push(`Error al importar: ${employeeCode}`);
      }
    }

    console.log(`[IMPORTACION] CSV: ${imported} importados, ${errors} errores`);

    return NextResponse.json({ imported, errors, errorDetails });
  } catch (error) {
    console.error("[IMPORTACION] ERROR:", error);
    return NextResponse.json(
      { error: "Error al procesar el archivo CSV" },
      { status: 500 }
    );
  }
}
