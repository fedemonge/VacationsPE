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

export type RequestType = "VACACIONES" | "RETORNO_ANTICIPADO";

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

// Role → allowed routes mapping
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  USUARIO: ["/solicitudes", "/retorno-anticipado"],
  SUPERVISOR: [
    "/solicitudes",
    "/retorno-anticipado",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
  ],
  RRHH: [
    "/solicitudes",
    "/retorno-anticipado",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
  ],
  GERENTE_PAIS: [
    "/solicitudes",
    "/retorno-anticipado",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/configuracion",
  ],
  ADMINISTRADOR: [
    "/solicitudes",
    "/retorno-anticipado",
    "/empleados",
    "/panel/aprobaciones",
    "/panel/saldos",
    "/panel/reportes",
    "/configuracion",
    "/backups",
  ],
};
