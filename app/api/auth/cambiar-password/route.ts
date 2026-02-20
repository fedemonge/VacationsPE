import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  hashPassword,
  validatePassword,
  clearMustChangePassword,
  createSessionCookie,
} from "@/lib/auth";

const SESSION_COOKIE = "vacaciones_session";

// POST: change password (authenticated user)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Debe iniciar sesión" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña y la confirmación no coinciden" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    // Validate current password
    const valid = await validatePassword(session.email, currentPassword);
    if (!valid) {
      return NextResponse.json(
        { error: "La contraseña actual es incorrecta" },
        { status: 401 }
      );
    }

    // Prevent reusing the same password
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña debe ser diferente a la actual" },
        { status: 400 }
      );
    }

    const passwordKey = `USER_PASSWORD_${session.email}`;

    // Update password
    await prisma.systemConfiguration.upsert({
      where: { key: passwordKey },
      update: {
        value: hashPassword(newPassword),
        updatedBy: session.email,
      },
      create: {
        key: passwordKey,
        value: hashPassword(newPassword),
        description: `Contraseña del usuario ${session.email}`,
        updatedBy: session.email,
      },
    });

    // Clear must-change-password flag
    await clearMustChangePassword(session.email);

    // Update session cookie to remove mustChangePassword flag
    const sessionValue = createSessionCookie({
      email: session.email,
      role: session.role,
      mustChangePassword: false,
    });

    console.log(
      `[AUTH] CAMBIO_PASSWORD: ${session.email} cambió su contraseña`
    );

    const response = NextResponse.json({
      message: "Contraseña actualizada exitosamente",
    });

    response.cookies.set(SESSION_COOKIE, sessionValue, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error("[AUTH] ERROR cambio password:", error);
    return NextResponse.json(
      { error: "Error al cambiar la contraseña" },
      { status: 500 }
    );
  }
}
