import { NextRequest } from "next/server";
import { getSession, SessionUser } from "@/lib/auth";

export async function validateWebhookOrSession(
  request: NextRequest,
  allowedRoles: string[] = ["ADMINISTRADOR", "GERENTE_PAIS", "RRHH"]
): Promise<{ authorized: boolean; isWebhook: boolean; session: SessionUser | null }> {
  const authHeader = request.headers.get("x-webhook-secret");
  const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;

  if (authHeader && webhookSecret && authHeader === webhookSecret) {
    return { authorized: true, isWebhook: true, session: null };
  }

  const session = await getSession();
  if (session && allowedRoles.includes(session.role)) {
    return { authorized: true, isWebhook: false, session };
  }

  return { authorized: false, isWebhook: false, session: null };
}
