import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import type { UserRole } from "@/types";

const DEFAULT_PASSWORD = "Woden123";

const VALID_ROLES: UserRole[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "GERENTE_PAIS",
  "RRHH",
];

// GET: list all user role assignments
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden gestionar usuarios" },
        { status: 403 }
      );
    }

    const roleConfigs = await prisma.systemConfiguration.findMany({
      where: { key: { startsWith: "USER_ROLE_" } },
      orderBy: { key: "asc" },
    });

    const users = roleConfigs.map((c) => ({
      email: c.key.replace("USER_ROLE_", ""),
      role: c.value,
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[USUARIOS] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST: assign role to email (creates user with default password Woden123)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden asignar roles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email es obligatorio" },
        { status: 400 }
      );
    }

    if (!role || !VALID_ROLES.includes(role as UserRole)) {
      return NextResponse.json(
        { error: `Rol inválido. Opciones: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const roleKey = `USER_ROLE_${normalizedEmail}`;
    const passwordKey = `USER_PASSWORD_${normalizedEmail}`;

    // Upsert role
    await prisma.systemConfiguration.upsert({
      where: { key: roleKey },
      update: { value: role, updatedBy: session.email },
      create: {
        key: roleKey,
        value: role,
        description: `Rol asignado al usuario ${normalizedEmail}`,
        updatedBy: session.email,
      },
    });

    // Create password entry if it doesn't exist (initial password: Woden123)
    const existingPassword = await prisma.systemConfiguration.findUnique({
      where: { key: passwordKey },
    });

    if (!existingPassword) {
      const mustChangePwdKey = `USER_MUST_CHANGE_PWD_${normalizedEmail}`;
      await prisma.systemConfiguration.create({
        data: {
          key: passwordKey,
          value: hashPassword(DEFAULT_PASSWORD),
          description: `Contraseña del usuario ${normalizedEmail}`,
          updatedBy: session.email,
        },
      });
      // Flag the user to change password on first login
      await prisma.systemConfiguration.upsert({
        where: { key: mustChangePwdKey },
        update: { value: "true", updatedBy: session.email },
        create: {
          key: mustChangePwdKey,
          value: "true",
          description: `Usuario ${normalizedEmail} debe cambiar contraseña`,
          updatedBy: session.email,
        },
      });
    }

    console.log(
      `[USUARIOS] ROL_ASIGNADO: ${normalizedEmail} → ${role} por ${session.email}`
    );

    return NextResponse.json({
      message: `Rol ${role} asignado a ${normalizedEmail}. Contraseña inicial: ${DEFAULT_PASSWORD}`,
      email: normalizedEmail,
      role,
    });
  } catch (error) {
    console.error("[USUARIOS] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE: remove user role assignment
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Solo los administradores pueden eliminar roles" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email es obligatorio" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Prevent removing your own role
    if (normalizedEmail === session.email) {
      return NextResponse.json(
        { error: "No puede eliminar su propio rol" },
        { status: 400 }
      );
    }

    const roleKey = `USER_ROLE_${normalizedEmail}`;
    const passwordKey = `USER_PASSWORD_${normalizedEmail}`;
    const mustChangePwdKey = `USER_MUST_CHANGE_PWD_${normalizedEmail}`;
    const resetTokenKey = `USER_RESET_TOKEN_${normalizedEmail}`;

    // Delete role, password, and related entries
    await prisma.systemConfiguration.deleteMany({
      where: { key: { in: [roleKey, passwordKey, mustChangePwdKey, resetTokenKey] } },
    });

    console.log(
      `[USUARIOS] ROL_ELIMINADO: ${normalizedEmail} por ${session.email}`
    );

    return NextResponse.json({
      message: `Rol eliminado para ${normalizedEmail}`,
    });
  } catch (error) {
    console.error("[USUARIOS] ERROR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
