"use client";

import Image from "next/image";
import Link from "next/link";

export default function SesionCerradaPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto">
        <Image
          src="/woden-logo.png"
          alt="Woden"
          width={80}
          height={80}
          className="h-20 w-auto mx-auto mb-6"
        />
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Sesión Cerrada
        </h1>
        <p className="text-gray-500 mb-8">
          Su sesión se ha cerrado correctamente. Gracias por utilizar el sistema
          de gestión de capital humano.
        </p>
        <Link href="/" className="btn-primary inline-block">
          Iniciar Sesión Nuevamente
        </Link>
      </div>
    </div>
  );
}
