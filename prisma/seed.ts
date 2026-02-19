import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // System Configuration
  const configs = [
    { key: "GERENTE_PAIS_EMAIL", value: "gerente@empresa.com.pe", description: "Email del Gerente País (aprobador nivel 3)" },
    { key: "GERENTE_PAIS_NOMBRE", value: "Carlos Rodríguez", description: "Nombre del Gerente País" },
    { key: "ANALISTA_RRHH_EMAIL", value: "rrhh@empresa.com.pe", description: "Email del Analista RRHH (aprobador nivel 2)" },
    { key: "ANALISTA_RRHH_NOMBRE", value: "María López", description: "Nombre del Analista RRHH" },
    { key: "POWER_AUTOMATE_WEBHOOK", value: "https://prod-xx.westus.logic.azure.com/workflows/...", description: "URL del webhook de Power Automate" },
    { key: "DIAS_ALERTA_RETRASO", value: "3", description: "Días hábiles para alerta de retraso" },
    { key: "DIAS_CANCELACION_AUTO", value: "7", description: "Días antes de inicio para cancelación automática" },
  ];

  for (const config of configs) {
    await prisma.systemConfiguration.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: { ...config, updatedBy: "seed" },
    });
  }

  // Employees
  const employees = [
    {
      employeeCode: "EMP-001",
      fullName: "Juan Pérez García",
      email: "juan.perez@empresa.com.pe",
      hireDate: new Date("2022-03-15"),
      costCenter: "CC-100",
      supervisorName: "Ana Torres",
      supervisorEmail: "ana.torres@empresa.com.pe",
      position: "Analista de Sistemas",
    },
    {
      employeeCode: "EMP-002",
      fullName: "Ana Torres Ruiz",
      email: "ana.torres@empresa.com.pe",
      hireDate: new Date("2020-01-10"),
      costCenter: "CC-100",
      supervisorName: "Carlos Rodríguez",
      supervisorEmail: "gerente@empresa.com.pe",
      position: "Jefa de Tecnología",
    },
    {
      employeeCode: "EMP-003",
      fullName: "Luis Fernández Quispe",
      email: "luis.fernandez@empresa.com.pe",
      hireDate: new Date("2023-06-01"),
      costCenter: "CC-200",
      supervisorName: "Ana Torres",
      supervisorEmail: "ana.torres@empresa.com.pe",
      position: "Desarrollador Senior",
    },
    {
      employeeCode: "EMP-004",
      fullName: "Rosa Mendoza Vega",
      email: "rosa.mendoza@empresa.com.pe",
      hireDate: new Date("2021-09-20"),
      costCenter: "CC-200",
      supervisorName: "Ana Torres",
      supervisorEmail: "ana.torres@empresa.com.pe",
      position: "Diseñadora UX",
    },
    {
      employeeCode: "EMP-005",
      fullName: "Pedro Castillo Ramos",
      email: "pedro.castillo@empresa.com.pe",
      hireDate: new Date("2024-01-15"),
      costCenter: "CC-300",
      supervisorName: "Carlos Rodríguez",
      supervisorEmail: "gerente@empresa.com.pe",
      position: "Contador",
    },
  ];

  const createdEmployees = [];
  for (const emp of employees) {
    const created = await prisma.employee.upsert({
      where: { employeeCode: emp.employeeCode },
      update: emp,
      create: emp,
    });
    createdEmployees.push(created);
  }

  // Vacation Accruals — create historical accruals for each employee
  for (const emp of createdEmployees) {
    const hireYear = emp.hireDate.getFullYear();
    const currentYear = new Date().getFullYear();

    for (let year = hireYear; year <= currentYear; year++) {
      const accrualStart = year === hireYear
        ? emp.hireDate
        : new Date(year, emp.hireDate.getMonth(), emp.hireDate.getDate());
      const accrualEnd = new Date(year + 1, emp.hireDate.getMonth(), emp.hireDate.getDate());

      const now = new Date();
      const monthsInPeriod = year < currentYear
        ? 12
        : Math.min(12, Math.max(0,
            (now.getFullYear() - accrualStart.getFullYear()) * 12
            + now.getMonth() - accrualStart.getMonth()));

      const totalAccrued = Math.min(30, monthsInPeriod * 2.5);
      const consumed = year < currentYear - 1 ? totalAccrued * 0.6 : 0;

      await prisma.vacationAccrual.upsert({
        where: { employeeId_accrualYear: { employeeId: emp.id, accrualYear: year } },
        update: {},
        create: {
          employeeId: emp.id,
          accrualYear: year,
          accrualStartDate: accrualStart,
          accrualEndDate: accrualEnd,
          monthlyRate: 2.5,
          monthsAccrued: monthsInPeriod,
          totalDaysAccrued: totalAccrued,
          totalDaysConsumed: consumed,
          remainingBalance: totalAccrued - consumed,
        },
      });
    }
  }

  console.log("Seed completado exitosamente");
  console.log(`- ${configs.length} configuraciones del sistema`);
  console.log(`- ${createdEmployees.length} empleados`);
  console.log("- Devengamientos de vacaciones creados para todos los empleados");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
