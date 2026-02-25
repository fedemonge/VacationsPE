import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface OrgNode {
  email: string;
  fullName: string;
  position: string;
  costCenter: string;
  costCenterDesc: string;
  employeeId: string;
  isOnVacation: boolean;
  vacationDateFrom?: string;
  vacationDateTo?: string;
  vacantPositions: {
    id: string;
    positionCode: string;
    title: string;
    positionType: string;
  }[];
  thirdParties: {
    id: string;
    positionCode: string;
    title: string;
    thirdPartyName: string;
    thirdPartyCompany: string;
  }[];
  children: OrgNode[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const costCenter = searchParams.get("costCenter");

    const userRole = session.role;
    const userEmail = session.email.toLowerCase();
    const fullAccessRoles = ["ADMINISTRADOR", "RRHH", "GERENTE_PAIS"];
    const hasFullAccess = fullAccessRoles.includes(userRole);

    console.log(
      `[ORGANIGRAMA] GET: costCenter=${costCenter || "TODAS"}, role=${userRole}, fullAccess=${hasFullAccess}`
    );

    // 1. Fetch active employees
    const empWhere: Record<string, unknown> = { terminationDate: null };
    if (costCenter) empWhere.costCenter = costCenter;

    const employees = await prisma.employee.findMany({ where: empWhere });

    // 2. Fetch vacant positions
    const posWhere: Record<string, unknown> = { status: "VACANTE" };
    if (costCenter) posWhere.costCenter = costCenter;

    const vacantPositions = await prisma.orgPosition.findMany({
      where: posWhere,
    });

    // 3. Fetch third-party positions (occupied by terceros)
    const thirdWhere: Record<string, unknown> = {
      positionType: "TERCERO",
      status: "OCUPADA",
    };
    if (costCenter) thirdWhere.costCenter = costCenter;

    const thirdPartyPositions = await prisma.orgPosition.findMany({
      where: thirdWhere,
    });

    // 4. Find employees currently on vacation
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59
    );

    const onVacation = await prisma.vacationRequest.findMany({
      where: {
        status: "APROBADA",
        dateFrom: { lte: endOfDay },
        dateTo: { gte: startOfDay },
      },
      select: {
        employeeId: true,
        dateFrom: true,
        dateTo: true,
      },
    });

    const vacationMap = new Map(
      onVacation.map((v) => [
        v.employeeId,
        { dateFrom: v.dateFrom, dateTo: v.dateTo },
      ])
    );

    // 5. Build lookups
    // Group vacant positions by supervisor email
    const vacantBySuper = new Map<
      string,
      { id: string; positionCode: string; title: string; positionType: string }[]
    >();
    for (const pos of vacantPositions) {
      const key = pos.reportsToEmail.toLowerCase();
      if (!vacantBySuper.has(key)) vacantBySuper.set(key, []);
      vacantBySuper.get(key)!.push({
        id: pos.id,
        positionCode: pos.positionCode,
        title: pos.title,
        positionType: pos.positionType,
      });
    }

    // Group third-party positions by supervisor email
    const thirdBySuper = new Map<
      string,
      {
        id: string;
        positionCode: string;
        title: string;
        thirdPartyName: string;
        thirdPartyCompany: string;
      }[]
    >();
    for (const pos of thirdPartyPositions) {
      const key = pos.reportsToEmail.toLowerCase();
      if (!thirdBySuper.has(key)) thirdBySuper.set(key, []);
      thirdBySuper.get(key)!.push({
        id: pos.id,
        positionCode: pos.positionCode,
        title: pos.title,
        thirdPartyName: pos.thirdPartyName || "",
        thirdPartyCompany: pos.thirdPartyCompany || "",
      });
    }

    // Group employees by supervisor email
    const childrenBySuper = new Map<string, typeof employees>();
    for (const emp of employees) {
      if (emp.email.toLowerCase() === emp.supervisorEmail.toLowerCase())
        continue;
      const key = emp.supervisorEmail.toLowerCase();
      if (!childrenBySuper.has(key)) childrenBySuper.set(key, []);
      childrenBySuper.get(key)!.push(emp);
    }

    // 6. Recursive tree builder
    const visited = new Set<string>();

    const buildNode = (emp: (typeof employees)[0]): OrgNode => {
      const key = emp.email.toLowerCase();
      visited.add(key);
      const vac = vacationMap.get(emp.id);

      const directReports = (childrenBySuper.get(key) || []).filter(
        (child) => !visited.has(child.email.toLowerCase())
      );

      return {
        email: emp.email,
        fullName: emp.fullName,
        position: emp.position,
        costCenter: emp.costCenter,
        costCenterDesc: emp.costCenterDesc,
        employeeId: emp.id,
        isOnVacation: !!vac,
        vacationDateFrom: vac
          ? vac.dateFrom.toISOString().split("T")[0]
          : undefined,
        vacationDateTo: vac
          ? vac.dateTo.toISOString().split("T")[0]
          : undefined,
        vacantPositions: vacantBySuper.get(key) || [],
        thirdParties: thirdBySuper.get(key) || [],
        children: directReports.map(buildNode),
      };
    }

    // 7. Find roots (self-supervisors)
    const roots = employees.filter(
      (e) => e.email.toLowerCase() === e.supervisorEmail.toLowerCase()
    );

    const tree = roots.map(buildNode);

    // 8. Also include employees whose supervisor is not in the dataset (orphans)
    for (const emp of employees) {
      const key = emp.email.toLowerCase();
      if (!visited.has(key)) {
        // This employee's supervisor is not in the filtered set — treat as root
        tree.push(buildNode(emp));
      }
    }

    // 9. Filter tree by role — supervisors/users only see their subtree
    let visibleTree = tree;

    if (!hasFullAccess) {
      // Find the user's node anywhere in the tree
      const findNode = (nodes: OrgNode[]): OrgNode | null => {
        for (const node of nodes) {
          if (node.email.toLowerCase() === userEmail) return node;
          const found = findNode(node.children);
          if (found) return found;
        }
        return null;
      };

      const userNode = findNode(tree);
      visibleTree = userNode ? [userNode] : [];
    }

    // 10. Compute summary from the visible tree
    const countTree = (nodes: OrgNode[]): { active: number; vacant: number; thirdParty: number; onVacation: number } => {
      let active = 0, vacant = 0, thirdParty = 0, onVacation = 0;
      for (const node of nodes) {
        active++;
        vacant += node.vacantPositions.length;
        thirdParty += node.thirdParties.length;
        if (node.isOnVacation) onVacation++;
        const childCounts = countTree(node.children);
        active += childCounts.active;
        vacant += childCounts.vacant;
        thirdParty += childCounts.thirdParty;
        onVacation += childCounts.onVacation;
      }
      return { active, vacant, thirdParty, onVacation };
    };

    const summary = countTree(visibleTree);

    return NextResponse.json({
      tree: visibleTree,
      summary,
    });
  } catch (error) {
    console.error("[ORGANIGRAMA] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
