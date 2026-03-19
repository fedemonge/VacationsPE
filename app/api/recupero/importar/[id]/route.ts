import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (session.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Solo administradores pueden eliminar importaciones" },
      { status: 403 }
    );
  }

  try {
    const importId = params.id;

    // Delete all tasks associated with this import
    const deleted = await prisma.recuperoTask.deleteMany({
      where: { importId },
    });

    // Delete the import record
    await prisma.recuperoImport.delete({
      where: { id: importId },
    });

    console.log(
      `[RECUPERO DELETE IMPORT] ${deleted.count} tareas eliminadas para importación ${importId} por ${session.email}`
    );

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      message: `Importación eliminada con ${deleted.count} registros`,
    });
  } catch (error) {
    console.error("[RECUPERO DELETE IMPORT] ERROR:", error);
    return NextResponse.json(
      { error: "Error al eliminar importación" },
      { status: 500 }
    );
  }
}
