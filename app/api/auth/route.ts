import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserRole,
  createSessionCookie,
  getSession,
  validatePassword,
  userRequiresPassword,
  userMustChangePassword,
} from "@/lib/auth";

const SESSION_COOKIE = "vacaciones_session";

// GET: return current session
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const mustChange = await userMustChangePassword(session.email);
  return NextResponse.json({
    authenticated: true,
    ...session,
    mustChangePassword: mustChange,
  });
}

// POST: login with email and optional password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email es obligatorio" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user requires password
    const needsPassword = await userRequiresPassword(normalizedEmail);
    if (needsPassword) {
      if (!password) {
        return NextResponse.json(
          { error: "Contraseña es obligatoria", requiresPassword: true },
          { status: 401 }
        );
      }
      const valid = await validatePassword(normalizedEmail, password);
      if (!valid) {
        return NextResponse.json(
          { error: "Contraseña incorrecta" },
          { status: 401 }
        );
      }
    }

    const role = await resolveUserRole(normalizedEmail);
    const mustChange = await userMustChangePassword(normalizedEmail);
    const sessionValue = createSessionCookie({ email: normalizedEmail, role, mustChangePassword: mustChange });

    console.log(`[AUTH] LOGIN: ${normalizedEmail} - rol: ${role}${mustChange ? " (debe cambiar contraseña)" : ""}`);

    const response = NextResponse.json({
      authenticated: true,
      email: normalizedEmail,
      role,
      mustChangePassword: mustChange,
    });

    response.cookies.set(SESSION_COOKIE, sessionValue, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error("[AUTH] ERROR:", error);
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 }
    );
  }
}

// DELETE: logout
export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  console.log("[AUTH] LOGOUT");
  return response;
}
