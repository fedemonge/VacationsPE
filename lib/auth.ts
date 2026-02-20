import { cookies } from "next/headers";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/types";

const SESSION_COOKIE = "vacaciones_session";

export interface SessionUser {
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
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

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function validatePassword(
  email: string,
  password: string
): Promise<boolean> {
  const config = await prisma.systemConfiguration.findFirst({
    where: { key: `USER_PASSWORD_${email}` },
  });

  // Users without a password entry can login with email only (legacy behavior)
  if (!config) return true;

  return config.value === hashPassword(password);
}

export async function userRequiresPassword(email: string): Promise<boolean> {
  const config = await prisma.systemConfiguration.findFirst({
    where: { key: `USER_PASSWORD_${email}` },
  });
  return !!config;
}

export async function userMustChangePassword(email: string): Promise<boolean> {
  const config = await prisma.systemConfiguration.findFirst({
    where: { key: `USER_MUST_CHANGE_PWD_${email}` },
  });
  return config?.value === "true";
}

export async function clearMustChangePassword(email: string): Promise<void> {
  await prisma.systemConfiguration.deleteMany({
    where: { key: `USER_MUST_CHANGE_PWD_${email}` },
  });
}

export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
