import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type");
    if (!type || !["burned", "agents", "effectiveness", "outside-peru", "missing-coords"].includes(type)) {
      return NextResponse.json(
        { error: "Tipo de reporte inválido. Opciones: burned, agents, outside-peru, missing-coords" },
        { status: 400 }
      );
    }

    const periodoYear = searchParams.get("periodoYear");
    const periodoMonth = searchParams.get("periodoMonth");
    const tipoBase = searchParams.get("tipoBase");
    const agenteCampo = searchParams.get("agenteCampo");
    const estado = searchParams.get("estado");
    const coordStatus = searchParams.get("coordStatus");
    const esQuemada = searchParams.get("esQuemada");
    const esAgendado = searchParams.get("esAgendado");
    const grupo = searchParams.get("grupo");

    // Build base where clause
    const where: Record<string, unknown> = {};

    if (periodoYear) where.periodoYear = parseInt(periodoYear, 10);
    if (periodoMonth) where.periodoMonth = parseInt(periodoMonth, 10);
    const dayParam = searchParams.get("day");
    if (dayParam) where.periodoDay = parseInt(dayParam, 10);
    if (tipoBase) where.tipoBase = tipoBase;
    if (agenteCampo) where.agenteCampo = { contains: agenteCampo };
    if (estado) where.estado = { contains: estado };
    if (coordStatus) where.coordStatus = coordStatus;
    if (esQuemada !== null && esQuemada !== undefined && esQuemada !== "") {
      where.esQuemada = esQuemada === "true";
    }
    if (esAgendado !== null && esAgendado !== undefined && esAgendado !== "") {
      where.esAgendado = esAgendado === "true";
    }
    if (grupo) where.grupo = { contains: grupo };
    const departamento = searchParams.get("departamento");
    if (departamento) where.departamento = departamento;

    switch (type) {
      case "burned": {
        const tasks = await prisma.recuperoTask.findMany({
          where: { ...where, esQuemada: true },
          orderBy: { distanciaMetros: "desc" },
          select: {
            id: true,
            agenteCampo: true,
            contrato: true,
            nombreUsuario: true,
            direccion: true,
            ciudad: true,
            estado: true,
            distanciaMetros: true,
            latitud: true,
            longitud: true,
            latitudCierre: true,
            longitudCierre: true,
            fechaCierre: true,
            tipoBase: true,
            grupo: true,
            departamento: true,
          },
        });

        return NextResponse.json({
          type: "burned",
          total: tasks.length,
          tasks,
        });
      }

      case "agents": {
        const agentStats = await prisma.recuperoTask.groupBy({
          by: ["agenteCampo"],
          where,
          _count: { id: true },
        });

        // For each agent, get burned and success counts
        const agentDetails = await Promise.all(
          agentStats.map(async (agent) => {
            const agentWhere = { ...where, agenteCampo: agent.agenteCampo };

            const [totalTasks, burnedTasks, exitosas, deptGroup] = await Promise.all([
              prisma.recuperoTask.count({ where: agentWhere }),
              prisma.recuperoTask.count({
                where: { ...agentWhere, esQuemada: true },
              }),
              prisma.recuperoTask.count({
                where: { ...agentWhere, tipoCierre: "RECUPERADO WODEN" },
              }),
              prisma.recuperoTask.groupBy({
                by: ["departamento"],
                where: { ...agentWhere, departamento: { not: null } },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 1,
              }),
            ]);

            let totalEquipos = 0;
            try {
              const eqResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
                `SELECT COALESCE(SUM("equiposRecuperados"), 0) as total FROM "RecuperoTask" WHERE "agenteCampo" = ?${
                  where.periodoYear !== undefined ? ` AND "periodoYear" = ${Number(where.periodoYear)}` : ""
                }${where.periodoMonth !== undefined ? ` AND "periodoMonth" = ${Number(where.periodoMonth)}` : ""}`,
                agent.agenteCampo
              );
              totalEquipos = Number(eqResult[0]?.total) || 0;
            } catch { /* column may not exist */ }

            return {
              agenteCampo: agent.agenteCampo,
              departamento: deptGroup.length > 0 ? deptGroup[0].departamento : null,
              total: totalTasks,
              exitosas,
              noExitosas: totalTasks - exitosas,
              quemadas: burnedTasks,
              equipos: totalEquipos,
              factorDeUso: exitosas > 0 ? Math.round((totalEquipos / exitosas) * 10) / 10 : 0,
              tasaExito: totalTasks > 0
                ? Math.round((exitosas / totalTasks) * 100 * 10) / 10
                : 0,
              tasaQuemadas: totalTasks > 0
                ? Math.round((burnedTasks / totalTasks) * 100 * 10) / 10
                : 0,
            };
          })
        );

        // Sort by exitosas descending
        agentDetails.sort((a, b) => b.exitosas - a.exitosas);

        return NextResponse.json({
          type: "agents",
          total: agentDetails.length,
          agents: agentDetails,
        });
      }

      case "effectiveness": {
        const effStats = await prisma.recuperoTask.groupBy({
          by: ["agenteCampo"],
          where,
          _count: { id: true },
        });

        const effDetails = await Promise.all(
          effStats.map(async (agent) => {
            const agentWhere = { ...where, agenteCampo: agent.agenteCampo };
            const [totalTasks, burnedTasks, exitosas, deptGroup] = await Promise.all([
              prisma.recuperoTask.count({ where: agentWhere }),
              prisma.recuperoTask.count({ where: { ...agentWhere, esQuemada: true } }),
              prisma.recuperoTask.count({ where: { ...agentWhere, tipoCierre: "RECUPERADO WODEN" } }),
              prisma.recuperoTask.groupBy({
                by: ["departamento"],
                where: { ...agentWhere, departamento: { not: null } },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 1,
              }),
            ]);
            let equipos = 0;
            try {
              const eqResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
                `SELECT COALESCE(SUM("equiposRecuperados"), 0) as total FROM "RecuperoTask" WHERE "agenteCampo" = ?${
                  where.periodoYear !== undefined ? ` AND "periodoYear" = ${Number(where.periodoYear)}` : ""
                }${where.periodoMonth !== undefined ? ` AND "periodoMonth" = ${Number(where.periodoMonth)}` : ""}`,
                agent.agenteCampo
              );
              equipos = Number(eqResult[0]?.total) || 0;
            } catch { /* column may not exist */ }
            return {
              agenteCampo: agent.agenteCampo,
              departamento: deptGroup.length > 0 ? deptGroup[0].departamento : null,
              total: totalTasks,
              exitosas,
              noExitosas: totalTasks - exitosas,
              quemadas: burnedTasks,
              tasaExito: totalTasks > 0 ? Math.round((exitosas / totalTasks) * 1000) / 10 : 0,
              equipos,
              factorDeUso: exitosas > 0 ? Math.round((equipos / exitosas) * 10) / 10 : 0,
            };
          })
        );

        effDetails.sort((a, b) => b.exitosas - a.exitosas);

        // Calculate "base gestionable" per department:
        // Unique customers (cedulaUsuario) whose LATEST tipoCierre is still routable
        // (not recovered, not final, not burned)
        const ROUTABLE_PATTERNS = [
          "cliente no encontrado", "desea la visita otro dia", "desea otro dia",
          "reconfirmado agente campo", "cliente de viaje",
          "pend. visita", "pend visita", "asignado",
          "cliente no cuenta con los equipos", "cliente no entrega equipos",
        ];
        const FINAL_PATTERNS = [
          "recuperado woden", "fraude", "servicio activo", "cliente ya entrego",
        ];

        // Get latest task per customer from last 3 calendar months (independent of filters)
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const allTasksForGest = await prisma.recuperoTask.findMany({
          where: {
            cedulaUsuario: { not: null },
            fechaCierre: { gte: threeMonthsAgo },
          },
          select: { cedulaUsuario: true, departamento: true, tipoCierre: true, esQuemada: true, fechaCierre: true },
          orderBy: { fechaCierre: "desc" },
        });

        // Keep only latest per customer
        const latestPerCustomer = new Map<string, { departamento: string | null; tipoCierre: string | null; esQuemada: boolean }>();
        for (const t of allTasksForGest) {
          if (t.cedulaUsuario && !latestPerCustomer.has(t.cedulaUsuario)) {
            latestPerCustomer.set(t.cedulaUsuario, { departamento: t.departamento, tipoCierre: t.tipoCierre, esQuemada: t.esQuemada });
          }
        }

        // Count gestionables per department
        const gestionablesByDept = new Map<string, number>();
        for (const [, c] of Array.from(latestPerCustomer)) {
          const dept = c.departamento || "SIN DEPARTAMENTO";
          const lower = (c.tipoCierre || "").toLowerCase().trim();
          const isFinal = FINAL_PATTERNS.some((p) => lower.includes(p));
          const isRoutable = ROUTABLE_PATTERNS.some((p) => lower.includes(p));
          if (!isFinal && (isRoutable || c.esQuemada || !lower)) {
            gestionablesByDept.set(dept, (gestionablesByDept.get(dept) || 0) + 1);
          }
        }

        const gestionables = Object.fromEntries(gestionablesByDept);

        return NextResponse.json({
          type: "effectiveness",
          total: effDetails.length,
          agents: effDetails,
          gestionables,
        });
      }

      case "outside-peru": {
        const tasks = await prisma.recuperoTask.findMany({
          where: { ...where, coordStatus: "OUTSIDE_PERU" },
          orderBy: { fechaCierre: "desc" },
          select: {
            id: true,
            agenteCampo: true,
            contrato: true,
            nombreUsuario: true,
            direccion: true,
            ciudad: true,
            departamento: true,
            latitud: true,
            longitud: true,
            estado: true,
            fechaCierre: true,
            tipoBase: true,
          },
        });

        return NextResponse.json({
          type: "outside-peru",
          total: tasks.length,
          tasks,
        });
      }

      case "missing-coords": {
        const tasks = await prisma.recuperoTask.findMany({
          where: { ...where, coordStatus: "MISSING" },
          orderBy: { fechaCierre: "desc" },
          select: {
            id: true,
            agenteCampo: true,
            contrato: true,
            nombreUsuario: true,
            direccion: true,
            ciudad: true,
            departamento: true,
            estado: true,
            fechaCierre: true,
            tipoBase: true,
          },
        });

        return NextResponse.json({
          type: "missing-coords",
          total: tasks.length,
          tasks,
        });
      }

      default:
        return NextResponse.json(
          { error: "Tipo de reporte no soportado" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[RECUPERO REPORTES] ERROR:", error);
    return NextResponse.json(
      { error: "Error al generar reporte" },
      { status: 500 }
    );
  }
}
