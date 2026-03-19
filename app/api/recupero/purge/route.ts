import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (session.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Solo el administrador puede purgar datos" },
      { status: 403 }
    );
  }

  try {
    const taskCount = await prisma.recuperoTask.count();
    const importCount = await prisma.recuperoImport.count();

    // Delete tasks first (FK constraint), then imports
    await prisma.recuperoTask.deleteMany({});
    await prisma.recuperoImport.deleteMany({});

    console.log(
      `[RECUPERO PURGE] ${taskCount} tareas y ${importCount} importaciones eliminadas por ${session.email}`
    );

    return NextResponse.json({
      message: `Se eliminaron ${taskCount.toLocaleString()} tareas y ${importCount} importaciones`,
      tasksDeleted: taskCount,
      importsDeleted: importCount,
    });
  } catch (error) {
    console.error("[RECUPERO PURGE] ERROR:", error);
    return NextResponse.json(
      { error: "Error al purgar datos" },
      { status: 500 }
    );
  }
}
