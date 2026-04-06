import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // System Configuration
  const configs = [
    { key: "GERENTE_PAIS_EMAIL", value: "gerente@empresa.com.pe", description: "Email del Gerente General (aprobador nivel 3)" },
    { key: "GERENTE_PAIS_NOMBRE", value: "Carlos Rodríguez", description: "Nombre del Gerente General" },
    { key: "ANALISTA_RRHH_EMAIL", value: "rrhh@empresa.com.pe", description: "Email del Analista RRHH (aprobador nivel 2)" },
    { key: "ANALISTA_RRHH_NOMBRE", value: "María López", description: "Nombre del Analista RRHH" },
    { key: "POWER_AUTOMATE_WEBHOOK", value: "https://prod-xx.westus.logic.azure.com/workflows/...", description: "URL del webhook de Power Automate" },
    { key: "DIAS_ALERTA_RETRASO", value: "3", description: "Días hábiles para alerta de retraso" },
    { key: "DIAS_CANCELACION_AUTO", value: "7", description: "Días antes de inicio para cancelación automática" },
    // User Roles
    { key: "USER_ROLE_admin@empresa.com.pe", value: "ADMINISTRADOR", description: "Rol: Administrador del sistema" },
    { key: "USER_ROLE_gerente@empresa.com.pe", value: "GERENTE_PAIS", description: "Rol: Gerente General (aprobador nivel 3)" },
    { key: "USER_ROLE_rrhh@empresa.com.pe", value: "RRHH", description: "Rol: Analista de Recursos Humanos (aprobador nivel 2)" },
    { key: "USER_ROLE_ana.torres@empresa.com.pe", value: "SUPERVISOR", description: "Rol: Supervisor (aprobador nivel 1)" },
    // fmonge@woden.com.pe — Admin + Country Manager
    { key: "USER_ROLE_fmonge@woden.com.pe", value: "ADMINISTRADOR", description: "Rol: Administrador y Gerente General" },
    { key: "USER_PASSWORD_fmonge@woden.com.pe", value: "36a5fbcd1e11b0a94c5f1157860352fa3ce0e9f87700fa888df6d3b9533af333", description: "Contraseña (SHA256) del usuario fmonge@woden.com.pe" },
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

  // Org Positions — create positions for existing employees + sample vacant/third-party
  let posCount = 0;
  for (const emp of createdEmployees) {
    posCount++;
    const positionCode = `POS-${String(posCount).padStart(4, "0")}`;
    await prisma.orgPosition.upsert({
      where: { positionCode },
      update: {},
      create: {
        positionCode,
        title: emp.position,
        costCenter: emp.costCenter,
        costCenterDesc: "",
        reportsToEmail: emp.supervisorEmail,
        employeeId: emp.id,
        positionType: "REGULAR",
        status: "OCUPADA",
      },
    });
  }

  // Vacant positions
  const vacantPositions = [
    { title: "Analista Junior", costCenter: "CC-100", reportsToEmail: "ana.torres@empresa.com.pe" },
    { title: "Desarrollador Frontend", costCenter: "CC-200", reportsToEmail: "ana.torres@empresa.com.pe" },
  ];
  for (const vp of vacantPositions) {
    posCount++;
    const code = `POS-${String(posCount).padStart(4, "0")}`;
    await prisma.orgPosition.upsert({
      where: { positionCode: code },
      update: {},
      create: {
        positionCode: code,
        title: vp.title,
        costCenter: vp.costCenter,
        costCenterDesc: "",
        reportsToEmail: vp.reportsToEmail,
        positionType: "REGULAR",
        status: "VACANTE",
      },
    });
  }

  // Third-party positions
  posCount++;
  const thirdPartyCode = `POS-${String(posCount).padStart(4, "0")}`;
  await prisma.orgPosition.upsert({
    where: { positionCode: thirdPartyCode },
    update: {},
    create: {
      positionCode: thirdPartyCode,
      title: "Soporte TI",
      costCenter: "CC-100",
      costCenterDesc: "",
      reportsToEmail: "ana.torres@empresa.com.pe",
      positionType: "TERCERO",
      status: "OCUPADA",
      thirdPartyName: "Carlos Externo",
      thirdPartyCompany: "Servicios TI SAC",
    },
  });

  // Payroll Legal Parameters
  const legalParams = [
    { paramKey: "UIT", paramValue: 5150, validFrom: new Date("2024-01-01"), validTo: new Date("2024-12-31"), description: "UIT 2024" },
    { paramKey: "UIT", paramValue: 5350, validFrom: new Date("2025-01-01"), validTo: new Date("2025-12-31"), description: "UIT 2025" },
    { paramKey: "UIT", paramValue: 5550, validFrom: new Date("2026-01-01"), validTo: null, description: "UIT 2026" },
    { paramKey: "RMV", paramValue: 1025, validFrom: new Date("2024-01-01"), validTo: null, description: "Remuneración Mínima Vital" },
    { paramKey: "ESSALUD_RATE", paramValue: 9, validFrom: new Date("2024-01-01"), validTo: null, description: "EsSalud 9% empleador" },
    { paramKey: "ONP_RATE", paramValue: 13, validFrom: new Date("2024-01-01"), validTo: null, description: "ONP 13%" },
    { paramKey: "AFP_FONDO_HABITAT", paramValue: 10, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Habitat - Fondo" },
    { paramKey: "AFP_SEGURO_HABITAT", paramValue: 1.36, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Habitat - Seguro" },
    { paramKey: "AFP_COMISION_HABITAT", paramValue: 1.35, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Habitat - Comisión" },
    { paramKey: "AFP_FONDO_INTEGRA", paramValue: 10, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Integra - Fondo" },
    { paramKey: "AFP_SEGURO_INTEGRA", paramValue: 1.36, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Integra - Seguro" },
    { paramKey: "AFP_COMISION_INTEGRA", paramValue: 1.55, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Integra - Comisión" },
    { paramKey: "AFP_FONDO_PRIMA", paramValue: 10, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Prima - Fondo" },
    { paramKey: "AFP_SEGURO_PRIMA", paramValue: 1.36, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Prima - Seguro" },
    { paramKey: "AFP_COMISION_PRIMA", paramValue: 1.55, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Prima - Comisión" },
    { paramKey: "AFP_FONDO_PROFUTURO", paramValue: 10, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Profuturo - Fondo" },
    { paramKey: "AFP_SEGURO_PROFUTURO", paramValue: 1.36, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Profuturo - Seguro" },
    { paramKey: "AFP_COMISION_PROFUTURO", paramValue: 1.69, validFrom: new Date("2024-01-01"), validTo: null, description: "AFP Profuturo - Comisión" },
    { paramKey: "BONIF_EXTRA_RATE", paramValue: 9, validFrom: new Date("2024-01-01"), validTo: null, description: "Bonificación Extraordinaria 9%" },
  ];

  for (const p of legalParams) {
    await prisma.payrollLegalParam.upsert({
      where: { paramKey_validFrom: { paramKey: p.paramKey, validFrom: p.validFrom } },
      update: { paramValue: p.paramValue },
      create: p,
    });
  }

  // ── Work Shifts (Turnos) ────────────────────────────────────────────
  const shifts = [
    { code: "T1", name: "Turno Mañana", startTime: "06:00", endTime: "14:00", breakMinutes: 0, effectiveHours: 8.0 },
    { code: "T2", name: "Turno Tarde", startTime: "14:00", endTime: "22:00", breakMinutes: 0, effectiveHours: 8.0 },
    { code: "T3", name: "Turno Administrativo", startTime: "08:00", endTime: "17:30", breakMinutes: 60, effectiveHours: 8.5 },
  ];

  for (const s of shifts) {
    await prisma.workShift.upsert({
      where: { code: s.code },
      update: { name: s.name, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, effectiveHours: s.effectiveHours },
      create: s,
    });
  }

  // ── Tardiness tolerance config ─────────────────────────────────────
  await prisma.systemConfiguration.upsert({
    where: { key: "TOLERANCIA_TARDANZA_MINUTOS" },
    update: { value: "5" },
    create: { key: "TOLERANCIA_TARDANZA_MINUTOS", value: "5", description: "Minutos de tolerancia para tardanza", updatedBy: "seed" },
  });

  // ── Payment batch config ──────────────────────────────────────────
  const batchConfigs = [
    { key: "JEFE_FINANCIERO_EMAIL", value: "", description: "Email del Jefe Financiero (aprobador nivel 2 de pago)" },
    { key: "JEFE_FINANCIERO_NOMBRE", value: "", description: "Nombre del Jefe Financiero" },
    { key: "BBVA_RUC_EMPRESA", value: "", description: "RUC de la empresa para archivo BBVA" },
    { key: "BBVA_RAZON_SOCIAL", value: "", description: "Razón social de la empresa para archivo BBVA" },
  ];
  for (const c of batchConfigs) {
    await prisma.systemConfiguration.upsert({
      where: { key: c.key },
      update: {},
      create: { ...c, updatedBy: "seed" },
    });
  }

  // ── FEC Financial Lines ────────────────────────────────────────────
  const financialLines = [
    { type: "PL", name: "Ventas" },
    { type: "PL", name: "Costo de Ventas" },
    { type: "PL", name: "Gastos Administrativos" },
    { type: "PL", name: "Gastos de Ventas" },
    { type: "PL", name: "Gastos Financieros" },
    { type: "PL", name: "Otros Ingresos" },
    { type: "PL", name: "Otros Gastos" },
    { type: "BS", name: "Cuentas por Cobrar" },
    { type: "BS", name: "Inventarios" },
    { type: "BS", name: "Activos Fijos" },
    { type: "BS", name: "Cuentas por Pagar" },
    { type: "BS", name: "Deuda Financiera" },
    { type: "CF", name: "Flujo Operativo" },
    { type: "CF", name: "Flujo de Inversión" },
    { type: "CF", name: "Flujo de Financiamiento" },
  ];

  for (const line of financialLines) {
    const existing = await prisma.fecFinancialLine.findFirst({
      where: { type: line.type, name: line.name },
    });
    if (!existing) {
      await prisma.fecFinancialLine.create({ data: line });
    }
  }

  // ── FEC (Financiando el Crecimiento) Seed Data ─────────────────────

  // FEC Companies
  const fecCompanies = [
    { name: "Woden del Perú", code: "WODEN-PE", currency: "PEN", country: "Perú" },
    { name: "Woden Colombia", code: "WODEN-CO", currency: "COP", country: "Colombia" },
    { name: "Woden Costa Rica", code: "WODEN-CR", currency: "CRC", country: "Costa Rica" },
  ];

  const createdCompanies = [];
  for (const co of fecCompanies) {
    const created = await prisma.fecCompany.upsert({
      where: { code: co.code },
      update: {},
      create: co,
    });
    createdCompanies.push(created);
  }
  const companyPE = createdCompanies.find(c => c.code === "WODEN-PE")!;
  const companyCO = createdCompanies.find(c => c.code === "WODEN-CO")!;

  // Assign payrollCompanyId (WODEN-PE) to all employees
  for (const emp of createdEmployees) {
    await prisma.employee.update({
      where: { id: emp.id },
      data: { payrollCompanyId: companyPE.id },
    });
  }

  // FEC Exchange Rates (Local Currency → USD)
  const exchangeRates = [
    // PEN to USD (1 PEN = ~0.27 USD)
    { currency: "PEN", periodYear: 2025, periodMonth: 10, rateToUsd: 0.268 },
    { currency: "PEN", periodYear: 2025, periodMonth: 11, rateToUsd: 0.267 },
    { currency: "PEN", periodYear: 2025, periodMonth: 12, rateToUsd: 0.270 },
    { currency: "PEN", periodYear: 2026, periodMonth: 1, rateToUsd: 0.271 },
    { currency: "PEN", periodYear: 2026, periodMonth: 2, rateToUsd: 0.269 },
    { currency: "PEN", periodYear: 2026, periodMonth: 3, rateToUsd: 0.272 },
    { currency: "PEN", periodYear: 2026, periodMonth: 4, rateToUsd: 0.270 },
    { currency: "PEN", periodYear: 2026, periodMonth: 5, rateToUsd: 0.268 },
    { currency: "PEN", periodYear: 2026, periodMonth: 6, rateToUsd: 0.265 },
    { currency: "PEN", periodYear: 2026, periodMonth: 7, rateToUsd: 0.266 },
    { currency: "PEN", periodYear: 2026, periodMonth: 8, rateToUsd: 0.267 },
    { currency: "PEN", periodYear: 2026, periodMonth: 9, rateToUsd: 0.268 },
    { currency: "PEN", periodYear: 2026, periodMonth: 10, rateToUsd: 0.269 },
    { currency: "PEN", periodYear: 2026, periodMonth: 11, rateToUsd: 0.270 },
    { currency: "PEN", periodYear: 2026, periodMonth: 12, rateToUsd: 0.271 },
    // COP to USD (1 COP = ~0.00024 USD)
    { currency: "COP", periodYear: 2026, periodMonth: 1, rateToUsd: 0.000238 },
    { currency: "COP", periodYear: 2026, periodMonth: 2, rateToUsd: 0.000240 },
    { currency: "COP", periodYear: 2026, periodMonth: 3, rateToUsd: 0.000242 },
    { currency: "COP", periodYear: 2026, periodMonth: 4, rateToUsd: 0.000241 },
    { currency: "COP", periodYear: 2026, periodMonth: 5, rateToUsd: 0.000239 },
    { currency: "COP", periodYear: 2026, periodMonth: 6, rateToUsd: 0.000237 },
    // CRC to USD (1 CRC = ~0.0019 USD)
    { currency: "CRC", periodYear: 2026, periodMonth: 1, rateToUsd: 0.00192 },
    { currency: "CRC", periodYear: 2026, periodMonth: 2, rateToUsd: 0.00190 },
    { currency: "CRC", periodYear: 2026, periodMonth: 3, rateToUsd: 0.00191 },
  ];

  for (const rate of exchangeRates) {
    await prisma.fecExchangeRate.upsert({
      where: { currency_periodYear_periodMonth: { currency: rate.currency, periodYear: rate.periodYear, periodMonth: rate.periodMonth } },
      update: { rateToUsd: rate.rateToUsd },
      create: rate,
    });
  }

  // FEC Areas
  const fecAreas = [
    { name: "Operaciones" },
    { name: "Finanzas" },
    { name: "Comercial" },
    { name: "Logística" },
    { name: "Recursos Humanos" },
  ];

  const createdAreas = [];
  for (const area of fecAreas) {
    const created = await prisma.fecArea.upsert({
      where: { name: area.name },
      update: {},
      create: area,
    });
    createdAreas.push(created);
  }

  // FEC Role Assignments
  const anaTorres = createdEmployees.find(e => e.email === "ana.torres@empresa.com.pe")!;
  const juanPerez = createdEmployees.find(e => e.email === "juan.perez@empresa.com.pe")!;
  const pedroCastillo = createdEmployees.find(e => e.email === "pedro.castillo@empresa.com.pe")!;
  const luisFernandez = createdEmployees.find(e => e.email === "luis.fernandez@empresa.com.pe")!;
  const rosaMendoza = createdEmployees.find(e => e.email === "rosa.mendoza@empresa.com.pe")!;

  const areaOps = createdAreas.find(a => a.name === "Operaciones")!;
  const areaFin = createdAreas.find(a => a.name === "Finanzas")!;
  const areaCom = createdAreas.find(a => a.name === "Comercial")!;
  const areaLog = createdAreas.find(a => a.name === "Logística")!;

  const fecRoles = [
    { employeeId: anaTorres.id, role: "ANALISTA_FINANCIERO", areaId: null },
    { employeeId: juanPerez.id, role: "RESPONSABLE_AREA", areaId: areaOps.id },
    { employeeId: pedroCastillo.id, role: "RESPONSABLE_AREA", areaId: areaFin.id },
    { employeeId: luisFernandez.id, role: "RESPONSABLE_AREA", areaId: areaCom.id },
    { employeeId: rosaMendoza.id, role: "RESPONSABLE_AREA", areaId: areaLog.id },
  ];

  for (const fr of fecRoles) {
    const existing = await prisma.fecRoleAssignment.findFirst({
      where: { employeeId: fr.employeeId, role: fr.role, areaId: fr.areaId },
    });
    if (!existing) {
      await prisma.fecRoleAssignment.create({ data: fr });
    }
  }

  // FEC User-Company Access (grant all employees access to WODEN-PE, some to WODEN-CO)
  const allEmps = [anaTorres, juanPerez, pedroCastillo, luisFernandez, rosaMendoza];
  for (const emp of allEmps) {
    await prisma.fecUserCompanyAccess.create({
      data: { employeeId: emp.id, companyId: companyPE.id },
    });
  }
  // Ana Torres and Pedro also have access to Colombia
  for (const emp of [anaTorres, pedroCastillo]) {
    await prisma.fecUserCompanyAccess.create({
      data: { employeeId: emp.id, companyId: companyCO.id },
    });
  }

  // Helper to convert local amounts to USD
  const penRate = 0.27; // approximate PEN→USD
  const copRate = 0.00024; // approximate COP→USD
  function toUsd(localVal: number, rate: number) { return Math.round(localVal * rate); }

  // FEC Ideas (now with company, projectCurrency, and dual values)
  function calcValues(months: number[]) {
    const eff = months.reduce((a, b) => a + b, 0);
    const nz = months.filter(v => v !== 0).length;
    const ann = nz > 0 ? (eff / nz) * 12 : 0;
    return { eff, ann };
  }

  const fecIdeas = [
    {
      code: "FEC-2026-001",
      title: "Renegociación contrato de transporte zona norte",
      description: "Renegociar las tarifas del contrato de transporte con TransLogic SAC para la zona norte, aprovechando volumen consolidado.",
      ideaType: "AHORRO",
      status: "IMPLEMENTADA",
      areaId: areaLog.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: rosaMendoza.id,
      plLine: "Gastos de transporte",
      cfLine: "Flujo operativo",
      implementationDate: new Date("2026-01-15"),
      localMonths: [12000, 12000, 15000, 15000, 15000, 18000, 18000, 18000, 20000, 20000, 20000, 22000],
      rate: penRate,
      createdByEmail: "rosa.mendoza@empresa.com.pe",
      createdByName: "Rosa Mendoza Vega",
      analystApprovedBy: "Ana Torres Ruiz",
      analystApprovedAt: new Date("2026-01-10"),
    },
    {
      code: "FEC-2026-002",
      title: "Automatización de reportes financieros mensuales",
      description: "Implementar RPA para la generación automática de reportes financieros mensuales, eliminando 40 horas/mes de trabajo manual.",
      ideaType: "AHORRO",
      status: "FIRME",
      areaId: areaFin.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: pedroCastillo.id,
      plLine: "Gastos de personal",
      implementationDate: new Date("2026-04-01"),
      localMonths: [5000, 5000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000],
      rate: penRate,
      createdByEmail: "pedro.castillo@empresa.com.pe",
      createdByName: "Pedro Castillo Ramos",
    },
    {
      code: "FEC-2026-003",
      title: "Optimización del consumo energético en planta",
      description: "Instalar sensores IoT y sistema de gestión energética para reducir consumo eléctrico en la planta principal un 15%.",
      ideaType: "AHORRO",
      status: "ESTUDIAR",
      areaId: areaOps.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: juanPerez.id,
      plLine: "Servicios públicos",
      implementationDate: new Date("2026-07-01"),
      localMonths: [0, 0, 3000, 5000, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000],
      rate: penRate,
      createdByEmail: "juan.perez@empresa.com.pe",
      createdByName: "Juan Pérez García",
    },
    {
      code: "FEC-2026-004",
      title: "Inversión en software CRM para equipo comercial",
      description: "Adquirir licencias de HubSpot para el equipo comercial (8 usuarios). Inversión que mejorará pipeline de ventas.",
      ideaType: "USO",
      status: "FIRME",
      areaId: areaCom.id,
      companyId: companyCO.id,
      projectCurrency: "COP",
      leadEmployeeId: luisFernandez.id,
      plLine: "Software y licencias",
      cfLine: "Inversiones operativas",
      implementationDate: new Date("2026-03-01"),
      localMonths: [-10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000, -10400000],
      rate: copRate,
      analystApprovalRequired: true,
      analystApprovedBy: "Ana Torres Ruiz",
      analystApprovedAt: new Date("2026-02-25"),
      createdByEmail: "luis.fernandez@empresa.com.pe",
      createdByName: "Luis Fernández Quispe",
    },
    {
      code: "FEC-2026-005",
      title: "Consolidación de proveedores de papelería",
      description: "Consolidar 5 proveedores de papelería y suministros de oficina en 1 solo, negociando descuento por volumen del 25%.",
      ideaType: "AHORRO",
      status: "IMPLEMENTADA",
      areaId: areaOps.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: juanPerez.id,
      plLine: "Suministros de oficina",
      implementationDate: new Date("2025-11-01"),
      localMonths: [800, 800, 800, 1000, 1000, 1000, 1200, 1200, 1200, 1200, 1200, 1200],
      rate: penRate,
      createdByEmail: "juan.perez@empresa.com.pe",
      createdByName: "Juan Pérez García",
      analystApprovedBy: "Ana Torres Ruiz",
      analystApprovedAt: new Date("2025-10-28"),
    },
    {
      code: "FEC-2026-006",
      title: "Contratación de consultoría tributaria especializada",
      description: "Contratar a firma de consultoría para optimización tributaria. Inversión de USD 4,000/mes por 6 meses.",
      ideaType: "USO",
      status: "ESTUDIAR",
      areaId: areaFin.id,
      companyId: companyCO.id,
      projectCurrency: "COP",
      leadEmployeeId: pedroCastillo.id,
      plLine: "Honorarios profesionales",
      implementationDate: new Date("2026-06-01"),
      localMonths: [-16600000, -16600000, -16600000, -16600000, -16600000, -16600000, 0, 0, 0, 0, 0, 0],
      rate: copRate,
      analystApprovalRequired: true,
      createdByEmail: "pedro.castillo@empresa.com.pe",
      createdByName: "Pedro Castillo Ramos",
    },
    {
      code: "FEC-2026-007",
      title: "Reducción de merma en almacén central",
      description: "Implementar sistema FIFO estricto con código de barras para reducir merma de materiales del 3.2% al 1.5%.",
      ideaType: "AHORRO",
      status: "FIRME",
      areaId: areaLog.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: rosaMendoza.id,
      plLine: "Costo de materiales",
      bsLine: "Inventarios",
      implementationDate: new Date("2026-02-15"),
      revisedImplementationDate: new Date("2026-04-15"),
      localMonths: [0, 3000, 5000, 8000, 10000, 10000, 12000, 12000, 12000, 12000, 12000, 12000],
      rate: penRate,
      createdByEmail: "rosa.mendoza@empresa.com.pe",
      createdByName: "Rosa Mendoza Vega",
    },
    {
      code: "FEC-2026-008",
      title: "Programa de retención de talento comercial",
      description: "Implementar programa de bonos por retención para los top 5 vendedores. Inversión para reducir rotación del 40% al 15%.",
      ideaType: "USO",
      status: "CANCELADA",
      areaId: areaCom.id,
      companyId: companyPE.id,
      projectCurrency: "PEN",
      leadEmployeeId: luisFernandez.id,
      plLine: "Bonos e incentivos",
      implementationDate: new Date("2026-02-01"),
      localMonths: [-3000, -3000, -3000, -3000, -3000, -3000, -3000, -3000, -3000, -3000, -3000, -3000],
      rate: penRate,
      analystApprovalRequired: true,
      cancelledAt: new Date("2026-02-20"),
      cancelReason: "Presupuesto reasignado a proyecto CRM (FEC-2026-004)",
      createdByEmail: "luis.fernandez@empresa.com.pe",
      createdByName: "Luis Fernández Quispe",
    },
  ];

  for (const idea of fecIdeas) {
    const local = idea.localMonths;
    const usd = local.map(v => toUsd(v, idea.rate));
    const localCalc = calcValues(local);
    const usdCalc = calcValues(usd);

    const data: Record<string, unknown> = {
      code: idea.code,
      title: idea.title,
      description: idea.description,
      ideaType: idea.ideaType,
      status: idea.status,
      areaId: idea.areaId,
      companyId: idea.companyId,
      projectCurrency: idea.projectCurrency,
      leadEmployeeId: idea.leadEmployeeId,
      plLine: idea.plLine || null,
      bsLine: (idea as Record<string, unknown>).bsLine || null,
      cfLine: (idea as Record<string, unknown>).cfLine || null,
      implementationDate: idea.implementationDate,
      revisedImplementationDate: (idea as Record<string, unknown>).revisedImplementationDate || null,
      createdByEmail: idea.createdByEmail,
      createdByName: idea.createdByName,
      analystApprovalRequired: idea.analystApprovalRequired || false,
      analystApprovedBy: (idea as Record<string, unknown>).analystApprovedBy || null,
      analystApprovedAt: (idea as Record<string, unknown>).analystApprovedAt || null,
      cancelledAt: (idea as Record<string, unknown>).cancelledAt || null,
      cancelReason: (idea as Record<string, unknown>).cancelReason || null,
      // Local currency months
      month1Value: local[0], month2Value: local[1], month3Value: local[2], month4Value: local[3],
      month5Value: local[4], month6Value: local[5], month7Value: local[6], month8Value: local[7],
      month9Value: local[8], month10Value: local[9], month11Value: local[10], month12Value: local[11],
      // USD months
      month1Usd: usd[0], month2Usd: usd[1], month3Usd: usd[2], month4Usd: usd[3],
      month5Usd: usd[4], month6Usd: usd[5], month7Usd: usd[6], month8Usd: usd[7],
      month9Usd: usd[8], month10Usd: usd[9], month11Usd: usd[10], month12Usd: usd[11],
      // Calculated
      annualizedValue: localCalc.ann,
      effectiveValue: localCalc.eff,
      annualizedValueUsd: usdCalc.ann,
      effectiveValueUsd: usdCalc.eff,
    };

    await prisma.fecIdea.upsert({
      where: { code: idea.code },
      update: {},
      create: data as Parameters<typeof prisma.fecIdea.create>[0]["data"],
    });
  }

  // FEC Status History
  const idea001 = await prisma.fecIdea.findUnique({ where: { code: "FEC-2026-001" } });
  const idea005 = await prisma.fecIdea.findUnique({ where: { code: "FEC-2026-005" } });
  const idea008 = await prisma.fecIdea.findUnique({ where: { code: "FEC-2026-008" } });

  if (idea001) {
    await prisma.fecStatusHistory.createMany({
      data: [
        { ideaId: idea001.id, fromStatus: "ESTUDIAR", toStatus: "FIRME", changedByEmail: "rosa.mendoza@empresa.com.pe", changedByName: "Rosa Mendoza Vega", createdAt: new Date("2025-12-20") },
        { ideaId: idea001.id, fromStatus: "FIRME", toStatus: "IMPLEMENTADA", changedByEmail: "ana.torres@empresa.com.pe", changedByName: "Ana Torres Ruiz", createdAt: new Date("2026-01-15") },
      ],
    });
  }
  if (idea005) {
    await prisma.fecStatusHistory.createMany({
      data: [
        { ideaId: idea005.id, fromStatus: "ESTUDIAR", toStatus: "FIRME", changedByEmail: "juan.perez@empresa.com.pe", changedByName: "Juan Pérez García", createdAt: new Date("2025-10-15") },
        { ideaId: idea005.id, fromStatus: "FIRME", toStatus: "IMPLEMENTADA", changedByEmail: "ana.torres@empresa.com.pe", changedByName: "Ana Torres Ruiz", createdAt: new Date("2025-11-01") },
      ],
    });
  }
  if (idea008) {
    await prisma.fecStatusHistory.createMany({
      data: [
        { ideaId: idea008.id, fromStatus: "ESTUDIAR", toStatus: "FIRME", changedByEmail: "luis.fernandez@empresa.com.pe", changedByName: "Luis Fernández Quispe", createdAt: new Date("2026-01-25") },
        { ideaId: idea008.id, fromStatus: "FIRME", toStatus: "CANCELADA", changedByEmail: "ana.torres@empresa.com.pe", changedByName: "Ana Torres Ruiz", reason: "Presupuesto reasignado a proyecto CRM", createdAt: new Date("2026-02-20") },
      ],
    });
  }

  console.log("Seed completado exitosamente");
  console.log(`- ${configs.length} configuraciones del sistema`);
  console.log(`- ${createdEmployees.length} empleados`);
  console.log("- Devengamientos de vacaciones creados para todos los empleados");
  console.log(`- ${posCount} posiciones organizacionales creadas`);
  console.log(`- ${legalParams.length} parámetros legales de planilla`);
  console.log(`- ${shifts.length} turnos de trabajo`);
  console.log("- Tolerancia de tardanza configurada (5 min)");
  console.log(`- ${fecCompanies.length} empresas FEC`);
  console.log(`- ${exchangeRates.length} tipos de cambio`);
  console.log(`- ${fecAreas.length} áreas FEC`);
  console.log(`- ${fecRoles.length} roles FEC asignados`);
  console.log(`- ${fecIdeas.length} ideas FEC con historial y valores duales`);
  console.log("- Acceso de usuarios a empresas configurado");
  console.log(`- ${financialLines.length} lineas financieras FEC`);

  // ==========================================
  // MRP — Material Requirements Planning
  // ==========================================

  // MRP Shift Configs
  const mrpShifts = [
    { name: "Mañana", startTime: "06:00", endTime: "14:00", costMultiplier: 1.0 },
    { name: "Tarde", startTime: "14:00", endTime: "22:00", costMultiplier: 1.25 },
    { name: "Noche", startTime: "22:00", endTime: "06:00", costMultiplier: 1.5 },
  ];
  const existingMrpShifts = await prisma.mrpShiftConfig.count();
  if (existingMrpShifts === 0) {
    await prisma.mrpShiftConfig.createMany({ data: mrpShifts });
  }

  // MRP Sub-Processes
  const mrpSubProcesses = [
    { code: "DIAG", name: "Diagnóstico", defaultSequence: 1, capacityPerHour: 4, requiresSpecialist: true },
    { code: "LIMP", name: "Limpieza", defaultSequence: 2, capacityPerHour: 8, requiresSpecialist: false },
    { code: "REP_COSM", name: "Reparación Cosmética", defaultSequence: 3, capacityPerHour: 5, requiresSpecialist: false },
    { code: "REACON", name: "Reacondicionamiento", defaultSequence: 4, capacityPerHour: 3, requiresSpecialist: true },
    { code: "REP_AVZ", name: "Reparación Avanzada", defaultSequence: 5, capacityPerHour: 2, requiresSpecialist: true },
    { code: "EMPAQ", name: "Empaque", defaultSequence: 6, capacityPerHour: 10, requiresSpecialist: false },
    { code: "CC", name: "Control de Calidad", defaultSequence: 7, capacityPerHour: 6, requiresSpecialist: true },
  ];
  for (const sp of mrpSubProcesses) {
    await prisma.mrpSubProcess.upsert({ where: { code: sp.code }, update: {}, create: sp });
  }

  // MRP Working Calendar
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear + 1]) {
    for (let month = 1; month <= 12; month++) {
      const existing = await prisma.mrpWorkingCalendar.findFirst({ where: { year, month } });
      if (!existing) {
        await prisma.mrpWorkingCalendar.create({ data: { year, month, workingDays: 22 } });
      }
    }
  }

  console.log("- MRP: 3 turnos, 7 subprocesos, calendario laboral");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
