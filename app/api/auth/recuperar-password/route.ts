import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateResetToken } from "@/lib/auth";

// POST: request password reset (sends email with token)
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
    const passwordKey = `USER_PASSWORD_${normalizedEmail}`;

    // Check if user exists (has a password entry)
    const existingPassword = await prisma.systemConfiguration.findUnique({
      where: { key: passwordKey },
    });

    if (!existingPassword) {
      // Don't reveal whether the email exists — always show success
      return NextResponse.json({
        message:
          "Si el correo está registrado, recibirá un enlace para restablecer su contraseña.",
      });
    }

    // Generate reset token with 1-hour expiry
    const token = generateResetToken();
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tokenKey = `USER_RESET_TOKEN_${normalizedEmail}`;

    await prisma.systemConfiguration.upsert({
      where: { key: tokenKey },
      update: {
        value: JSON.stringify({ token, expiry }),
        updatedBy: "system",
      },
      create: {
        key: tokenKey,
        value: JSON.stringify({ token, expiry }),
        description: `Token de recuperación para ${normalizedEmail}`,
        updatedBy: "system",
      },
    });

    // Build reset URL
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/restablecer-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email via SES (or log in dev)
    if (process.env.SES_FROM_EMAIL) {
      // TODO: integrate with Amazon SES when configured
      console.log(
        `[AUTH] RECUPERACION: Email enviado a ${normalizedEmail}`
      );
    } else {
      // Dev mode: log the reset link
      console.log(
        `[AUTH] RECUPERACION: Token generado para ${normalizedEmail}`
      );
      console.log(`[AUTH] RECUPERACION: Enlace de restablecimiento: ${resetUrl}`);
    }

    return NextResponse.json({
      message:
        "Si el correo está registrado, recibirá un enlace para restablecer su contraseña.",
      // Include resetUrl in dev for testing
      ...(process.env.NODE_ENV !== "production" && { resetUrl }),
    });
  } catch (error) {
    console.error("[AUTH] ERROR recuperación:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}

// PATCH: reset password using token
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, token, newPassword, confirmPassword } = body;

    if (!email || !token || !newPassword || !confirmPassword) {
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
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const tokenKey = `USER_RESET_TOKEN_${normalizedEmail}`;

    // Validate token
    const tokenConfig = await prisma.systemConfiguration.findUnique({
      where: { key: tokenKey },
    });

    if (!tokenConfig) {
      return NextResponse.json(
        {
          error:
            "El enlace de recuperación es inválido o ha expirado. Solicite uno nuevo.",
        },
        { status: 400 }
      );
    }

    const tokenData = JSON.parse(tokenConfig.value);

    if (tokenData.token !== token) {
      return NextResponse.json(
        {
          error:
            "El enlace de recuperación es inválido o ha expirado. Solicite uno nuevo.",
        },
        { status: 400 }
      );
    }

    if (new Date(tokenData.expiry) < new Date()) {
      // Clean up expired token
      await prisma.systemConfiguration.delete({ where: { key: tokenKey } });
      return NextResponse.json(
        {
          error:
            "El enlace de recuperación ha expirado. Solicite uno nuevo.",
        },
        { status: 400 }
      );
    }

    // Update password
    const passwordKey = `USER_PASSWORD_${normalizedEmail}`;
    await prisma.systemConfiguration.update({
      where: { key: passwordKey },
      data: {
        value: hashPassword(newPassword),
        updatedBy: normalizedEmail,
      },
    });

    // Delete the used token
    await prisma.systemConfiguration.delete({ where: { key: tokenKey } });

    // Clear must-change-password flag if it exists
    await prisma.systemConfiguration.deleteMany({
      where: { key: `USER_MUST_CHANGE_PWD_${normalizedEmail}` },
    });

    console.log(
      `[AUTH] PASSWORD_RESTABLECIDA: ${normalizedEmail} restableció su contraseña`
    );

    return NextResponse.json({
      message:
        "Contraseña restablecida exitosamente. Ya puede iniciar sesión con su nueva contraseña.",
    });
  } catch (error) {
    console.error("[AUTH] ERROR restablecimiento:", error);
    return NextResponse.json(
      { error: "Error al restablecer la contraseña" },
      { status: 500 }
    );
  }
}
