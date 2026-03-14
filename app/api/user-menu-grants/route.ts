import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

function getCallerEmail(): string | null {
  const cookieStore = cookies();
  const session = cookieStore.get("session");
  if (!session) return null;
  try {
    const data = JSON.parse(Buffer.from(session.value, "base64").toString());
    return data.email || null;
  } catch {
    return null;
  }
}

// GET /api/user-menu-grants?email=xxx  (omit email to get all)
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const grants = await prisma.userMenuGrant.findMany({
    where: email ? { userEmail: email } : undefined,
    orderBy: [{ userEmail: "asc" }, { menuPath: "asc" }],
  });
  return NextResponse.json({ grants });
}

// POST /api/user-menu-grants  { userEmail, menuPath }
export async function POST(req: NextRequest) {
  const callerEmail = getCallerEmail();
  if (!callerEmail) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { userEmail, menuPath } = await req.json();
  if (!userEmail || !menuPath) {
    return NextResponse.json({ error: "userEmail y menuPath son requeridos" }, { status: 400 });
  }

  const grant = await prisma.userMenuGrant.upsert({
    where: { userEmail_menuPath: { userEmail, menuPath } },
    update: { grantedBy: callerEmail },
    create: { userEmail, menuPath, grantedBy: callerEmail },
  });
  return NextResponse.json({ grant });
}

// DELETE /api/user-menu-grants?userEmail=xxx&menuPath=yyy
export async function DELETE(req: NextRequest) {
  const userEmail = req.nextUrl.searchParams.get("userEmail");
  const menuPath = req.nextUrl.searchParams.get("menuPath");
  if (!userEmail || !menuPath) {
    return NextResponse.json({ error: "Parámetros faltantes" }, { status: 400 });
  }

  await prisma.userMenuGrant.deleteMany({
    where: { userEmail, menuPath },
  });
  return NextResponse.json({ ok: true });
}
