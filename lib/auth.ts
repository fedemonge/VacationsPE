import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/types";

const SESSION_COOKIE = "vacaciones_session";

export interface SessionUser {
  email: string;
  role: UserRole;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  if (!sessionCookie?.value) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(sessionCookie.value, "base64").toString("utf-8")
    );
    return decoded as SessionUser;
  } catch {
    return null;
  }
}

export async function resolveUserRole(email: string): Promise<UserRole> {
  const config = await prisma.systemConfiguration.findFirst({
    where: { key: `USER_ROLE_${email}` },
  });

  if (!config) return "USUARIO";

  const validRoles: UserRole[] = [
    "ADMINISTRADOR",
    "SUPERVISOR",
    "GERENTE_PAIS",
    "RRHH",
    "USUARIO",
  ];

  return validRoles.includes(config.value as UserRole)
    ? (config.value as UserRole)
    : "USUARIO";
}

export function createSessionCookie(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user)).toString("base64");
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    USUARIO: "Usuario",
    ADMINISTRADOR: "Administrador",
    SUPERVISOR: "Supervisor",
    GERENTE_PAIS: "Gerente País",
    RRHH: "Recursos Humanos",
  };
  return labels[role];
}
