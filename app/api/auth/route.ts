import { NextRequest, NextResponse } from "next/server";
import { resolveUserRole, createSessionCookie, getSession } from "@/lib/auth";

const SESSION_COOKIE = "vacaciones_session";

// GET: return current session
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, ...session });
}

// POST: login with email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email es obligatorio" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const role = await resolveUserRole(normalizedEmail);
    const sessionValue = createSessionCookie({ email: normalizedEmail, role });

    console.log(`[AUTH] LOGIN: ${normalizedEmail} - rol: ${role}`);

    const response = NextResponse.json({
      authenticated: true,
      email: normalizedEmail,
      role,
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
