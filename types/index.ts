export type VacationRequestStatus =
  | "PENDIENTE"
  | "NIVEL_1_PENDIENTE"
  | "NIVEL_2_PENDIENTE"
  | "NIVEL_3_PENDIENTE"
  | "APROBADA"
  | "RECHAZADA"
  | "CANCELADA";

export type EarlyReturnStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export type ApprovalStatus = "PENDIENTE" | "APROBADO" | "RECHAZADO";

export type RequestType =
  | "VACACIONES"
  | "RETORNO_ANTICIPADO"
  | "VACACIONES_DINERO"
  | "NUEVA_POSICION"
  | "CONTRATACION";

// Org chart & staff management types
export type StaffRequestType = "NUEVA_POSICION" | "CONTRATACION";
export type OrgPositionType = "REGULAR" | "TERCERO";
export type OrgPositionStatus = "VACANTE" | "OCUPADA" | "INACTIVA";

export interface OrgChartNode {
  email: string;
  fullName: string;
  position: string;
  costCenter: string;
  costCenterDesc: string;
  employeeId: string;
  isOnVacation: boolean;
  vacationDateFrom?: string;
  vacationDateTo?: string;
  vacantPositions: OrgVacantPosition[];
  thirdParties: OrgThirdParty[];
  children: OrgChartNode[];
}

export interface OrgVacantPosition {
  id: string;
  positionCode: string;
  title: string;
  positionType: OrgPositionType;
}

export interface OrgThirdParty {
  id: string;
  positionCode: string;
  title: string;
  thirdPartyName: string;
  thirdPartyCompany: string;
}

export interface StaffKPIs {
  activeHeadcount: number;
  vacantPositions: number;
  thirdPartyCount: number;
  pendingRequests: number;
  avgTimeToHireDays: number | null;
  hiresThisMonth: number;
  terminationsThisMonth: number;
}

export interface StaffReportEntry {
  month: string;
  monthLabel: string;
  hires: number;
  terminations: number;
  headcount: number;
  vacantPositions: number;
  thirdPartyCount: number;
}

export interface ApprovalWebhookPayload {
  requestId: string;
  requestType: RequestType;
  employeeName: string;
  employeeEmail: string;
  supervisorName: string;
  supervisorEmail: string;
  hrAnalystEmail: string;
  countryManagerEmail: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  callbackUrl: string;
}

export interface ApprovalCallbackPayload {
  requestId: string;
  level: number;
  status: "APROBADO" | "RECHAZADO";
  approverEmail: string;
  approverName: string;
  comments: string | null;
  decidedAt: string;
}

export interface BalancePeriod {
  accrualYear: number;
  accrued: number;
  consumed: number;
  remaining: number;
}

export interface EmployeeBalance {
  employeeId: string;
  employeeName: string;
  totalAvailable: number;
  periods: BalancePeriod[];
}

export type UserRole =
  | "USUARIO"
  | "ADMINISTRADOR"
  | "SUPERVISOR"
  | "GERENTE_PAIS"
  | "RRHH";

export type AdjustmentType =
  | "CARGA_INICIAL"
  | "AJUSTE_MANUAL"
  | "CORRECCION";

// Monthly report types (for Power Automate integration)
export interface MonthlyReportResponse {
  reportMonth: string;
  reportMonthLabel: string;
  generatedAt: string;
  supervisors: SupervisorReport[];
}

export interface SupervisorReport {
  supervisorEmail: string;
  supervisorName: string;
  employees: EmployeeMonthlyReport[];
}

export interface EmployeeMonthlyReport {
  employeeCode: string;
  fullName: string;
  email: string;
  costCenter: string;
  balanceByPeriod: PeriodBalanceDetail[];
  movements: MonthMovements;
}

export interface PeriodBalanceDetail {
  accrualYear: number;
  totalDaysAccrued: number;
  totalDaysConsumed: number;
  remainingBalance: number;
}

export interface MonthMovements {
  vacacionesTomadas: VacationMovement[];
  vacacionesEnDinero: CashOutMovement[];
  ajustesManuales: AdjustmentMovement[];
  devengamientoDelMes: AccrualMovement[];
}

export interface VacationMovement {
  requestId: string;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  daysConsumed: number;
  accrualYear: number;
}

export interface CashOutMovement {
  requestId: string;
  daysConsumed: number;
  accrualYear: number;
}

export interface AdjustmentMovement {
  adjustmentType: string;
  accrualYear: number;
  daysDelta: number;
  reason: string;
  adjustedBy: string;
}

export interface AccrualMovement {
  accrualYear: number;
  previousAccrued: number;
  currentAccrued: number;
  increment: number;
}

// Overdue vacation alert types
export interface OverdueAlertResponse {
  generatedAt: string;
  cutoffDate: string;
  countryManagerEmail: string;
  totalOverdueEmployees: number;
  totalOverdueDays: number;
  supervisors: OverdueSupervisorGroup[];
}

export interface OverdueSupervisorGroup {
  supervisorEmail: string;
  supervisorName: string;
  totalOverdueDays: number;
  employees: OverdueEmployeeDetail[];
}

export interface OverdueEmployeeDetail {
  employeeCode: string;
  fullName: string;
  email: string;
  costCenter: string;
  totalOverdueDays: number;
  overduePeriods: OverduePeriodDetail[];
}

export interface OverduePeriodDetail {
  accrualYear: number;
  accrualEndDate: string;
  remainingBalance: number;
  monthsOverdue: number;
}

// Role → allowed routes mapping
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  USUARIO: [
    "/solicitudes",
    "/retorno-anticipado",
    "/vacaciones-dinero",
    "/organigrama",
  ],
  SUPERVISOR: [
    "/solicitudes",
    "/retorno-anticipado",
    "/vacaciones-dinero",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/organigrama",
    "/solicitudes-personal",
    "/panel/personal",
  ],
  RRHH: [
    "/solicitudes",
    "/retorno-anticipado",
    "/vacaciones-dinero",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/organigrama",
    "/solicitudes-personal",
    "/panel/personal",
  ],
  GERENTE_PAIS: [
    "/solicitudes",
    "/retorno-anticipado",
    "/vacaciones-dinero",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/configuracion",
    "/organigrama",
    "/solicitudes-personal",
    "/panel/personal",
  ],
  ADMINISTRADOR: [
    "/solicitudes",
    "/retorno-anticipado",
    "/vacaciones-dinero",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/configuracion",
    "/backups",
    "/organigrama",
    "/solicitudes-personal",
    "/panel/personal",
  ],
};
