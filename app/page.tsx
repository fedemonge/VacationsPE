import Link from "next/link";

const features = [
  {
    title: "Solicitar Vacaciones",
    description: "Crea una nueva solicitud de vacaciones con validación automática de saldo y anticipación.",
    href: "/solicitudes",
    icon: "📋",
  },
  {
    title: "Retorno Anticipado",
    description: "Solicita un retorno anticipado de un periodo de vacaciones activo.",
    href: "/retorno-anticipado",
    icon: "↩️",
  },
  {
    title: "Gestión de Empleados",
    description: "Administra la población de empleados, importa datos por CSV.",
    href: "/empleados",
    icon: "👥",
  },
  {
    title: "Panel de Aprobaciones",
    description: "Seguimiento en tiempo real del flujo de aprobación de solicitudes.",
    href: "/panel/aprobaciones",
    icon: "✅",
  },
  {
    title: "Saldos de Vacaciones",
    description: "Consulta saldos desglosados por periodo de devengamiento con control FIFO.",
    href: "/panel/saldos",
    icon: "📊",
  },
  {
    title: "Reportes",
    description: "Reportes de antigüedad, tiempos de aprobación y días tomados por periodo.",
    href: "/panel/reportes",
    icon: "📈",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Sistema de Gestión de Vacaciones
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Gestiona solicitudes de vacaciones, controla saldos por periodo de devengamiento
          y realiza seguimiento de aprobaciones en tiempo real.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="card hover:shadow-md hover:border-woden-primary transition-all duration-200 group"
          >
            <div className="text-3xl mb-3">{feature.icon}</div>
            <h2 className="text-lg font-semibold text-gray-900 group-hover:text-woden-primary mb-2">
              {feature.title}
            </h2>
            <p className="text-sm text-gray-500">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
