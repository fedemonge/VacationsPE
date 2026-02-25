# VacationsPE - Sistema de Gestión de Vacaciones

> Sistema de gestión de vacaciones para Perú, alojado en AWS Amplify, con integración Power Automate (Office 365)

## Descripción General

Sistema web que gestiona solicitudes de vacaciones, retornos anticipados, vacaciones en dinero (cash-out), control de saldo con lógica FIFO por periodo de devengamiento, y flujos de aprobación de 3 niveles. Emails y reportes automáticos via Power Automate. Interfaz en español (es-PE).

### Funcionalidades Implementadas
- Solicitud de vacaciones con validación de 30 días de anticipación
- Retorno anticipado con justificación obligatoria de 50+ palabras
- Vacaciones en dinero (cash-out) — máximo 15 días por periodo, con FIFO
- Gestión de empleados (alta manual, importación CSV, selector de supervisor)
- Auto-supervisor para cargo "Gerente General" o "Country Manager"
- Control de saldo con devengamiento mensual y consumo FIFO
- Aprobación in-app de 3 niveles (Supervisor → RRHH → Gerente General)
- Devolución de solicitudes al nivel anterior
- Ajuste manual de saldos por administradores
- Dashboard de aprobaciones, saldos y reportes
- Gestión de centros de costos
- Gestión de usuarios y roles con contraseñas
- Reporte mensual por supervisor (API para Power Automate)
- Alerta de vacaciones vencidas (>12 meses) (API para Power Automate)
- Sincronización de supervisores desde O365 via Power Automate
- Respaldos de base de datos
- Navegación con menús desplegables agrupados (responsive)
- Tabla de empleados con columnas ordenables (click en encabezado)
- Enforcement backend de auto-supervisor para Gerente General / Country Manager
- **Organigrama** — visualización top-down tipo árbol con líneas conectoras, filtros por centro de costos, acceso restringido por rol
- **Gestión de posiciones** — posiciones vacantes, terceros, CRUD de posiciones
- **Solicitudes de personal** — nueva posición y contratación con aprobación 3 niveles
- **KPIs de personal** — tiempo de contratación, altas/bajas del mes, headcount
- **Reportes de personal** — tendencia mensual con filtros combinados (empleados, vacantes, terceros)

## Tech Stack

```
Frontend:     Next.js 14 (App Router) + TypeScript + Tailwind CSS
Backend:      Next.js API Routes
Database:     SQLite (dev) / PostgreSQL (prod) con Prisma ORM
Hosting:      AWS Amplify
Integración:  Power Automate via HTTP webhooks + API endpoints
Email:        Power Automate (O365 Outlook connector)
Auth:         Cookie-based sessions (SystemConfiguration table)
i18n:         Español (locale es-PE)
```

## Branding — Woden

```
Color Primario:           #EA7704 (naranja)
Color Primario Hover:     #D06A03
Color de Fondo:           #FFFFFF
Color de Fondo Secciones: rgba(234, 119, 4, 0.15)
Color de Texto:           #1F2937
Color de Éxito:           #10B981
Color de Alerta:          #F59E0B
Color de Error:           #EF4444
Border Radius:            1px
```

## Autenticación y Roles

Auth is cookie-based. User roles stored in `SystemConfiguration` with key `USER_ROLE_<email>`. Passwords stored as SHA-256 hashes with key `USER_PASSWORD_<email>`.

### Roles
| Role | Internal Key | Permisos |
|------|-------------|----------|
| Usuario | `USUARIO` | Solicitudes, retorno, dinero, organigrama (ver) |
| Supervisor | `SUPERVISOR` | + Aprobaciones, saldos, reportes, personal |
| RRHH | `RRHH` | + Empleados, personal |
| Gerente General | `GERENTE_PAIS` | + Configuración, personal |
| Administrador | `ADMINISTRADOR` | Todo incluyendo respaldos, personal |

**Nota**: Internal key is `GERENTE_PAIS` but display label is "Gerente General" everywhere in UI.

### Administradores por defecto
- `fmonge@woden.com.pe` — ADMINISTRADOR (con contraseña)

## Estructura del Proyecto (Actual)

```
VacationsPE/
├── app/
│   ├── layout.tsx                        # Layout con Header
│   ├── page.tsx                          # Login + home
│   ├── solicitudes/page.tsx              # Solicitud de vacaciones
│   ├── retorno-anticipado/page.tsx       # Retorno anticipado
│   ├── vacaciones-dinero/page.tsx        # Vacaciones en dinero (cash-out)
│   ├── empleados/page.tsx                # Gestión de empleados + supervisores
│   ├── organigrama/page.tsx              # Organigrama interactivo
│   ├── solicitudes-personal/page.tsx    # Solicitud de personal (nueva posición/contratación)
│   ├── panel/
│   │   ├── aprobaciones/page.tsx         # Dashboard de aprobaciones
│   │   ├── saldos/page.tsx              # Dashboard de saldos
│   │   ├── reportes/page.tsx            # Reportes interactivos
│   │   └── personal/page.tsx            # Panel de personal (KPIs, aprobaciones, reportes)
│   ├── configuracion/page.tsx            # Config del sistema + usuarios + centros de costos
│   ├── backups/page.tsx                  # Respaldos de BD
│   ├── cambiar-password/page.tsx         # Cambio de contraseña
│   ├── restablecer-password/page.tsx     # Recuperación de contraseña
│   ├── sesion-cerrada/page.tsx           # Página post-logout
│   └── api/
│       ├── auth/route.ts                 # Login/logout/session
│       ├── solicitudes/
│       │   ├── route.ts                  # GET + POST solicitudes
│       │   ├── [id]/route.ts             # GET + PATCH solicitud
│       │   └── retirar/route.ts          # POST retirar solicitud
│       ├── retorno-anticipado/route.ts   # GET + POST retorno
│       ├── vacaciones-dinero/route.ts    # GET + POST cash-out
│       ├── empleados/
│       │   ├── route.ts                  # GET + POST empleados
│       │   ├── [id]/route.ts             # GET + PATCH empleado
│       │   ├── importar/route.ts         # POST importación CSV
│       │   └── supervisores/route.ts     # GET + PATCH + POST (Power Automate sync)
│       ├── aprobaciones/
│       │   ├── decidir/route.ts          # POST aprobar/rechazar (in-app)
│       │   ├── devolver/route.ts         # POST devolver al nivel anterior
│       │   └── callback/route.ts         # POST callback de Power Automate
│       ├── saldos/
│       │   ├── route.ts                  # GET saldos con movimientos
│       │   └── ajustar/route.ts          # GET + POST ajustes manuales
│       ├── reportes/
│       │   ├── route.ts                  # GET reportes (aprobaciones, aging)
│       │   └── mensual/route.ts          # GET reporte mensual (Power Automate)
│       ├── alertas/
│       │   └── vencidas/route.ts         # GET vacaciones vencidas (Power Automate)
│       ├── organigrama/route.ts          # GET organigrama (tree structure)
│       ├── posiciones/
│       │   ├── route.ts                  # GET + POST posiciones
│       │   └── [id]/route.ts             # GET + PATCH posición
│       ├── solicitudes-personal/
│       │   ├── route.ts                  # GET + POST solicitudes de personal
│       │   └── [id]/route.ts             # GET + PATCH solicitud de personal
│       ├── centros-costos/route.ts       # GET + POST + DELETE centros de costos
│       ├── configuracion/route.ts        # GET + PATCH configuración
│       ├── usuarios/route.ts             # GET + POST + DELETE usuarios
│       ├── backups/
│       │   ├── route.ts                  # GET + POST respaldos
│       │   └── restaurar/route.ts        # POST restaurar respaldo
│       └── biometrico/route.ts           # POST datos biométricos
├── components/
│   ├── layout/Header.tsx                 # Header con menús desplegables agrupados
│   └── AuthProvider.tsx                  # Context de autenticación
├── lib/
│   ├── prisma.ts                         # Cliente Prisma singleton
│   ├── auth.ts                           # Session, roles, password hashing
│   ├── webhook-auth.ts                   # Auth compartida para endpoints Power Automate
│   ├── balance/
│   │   ├── accrual.ts                    # Recálculo de devengamiento
│   │   └── consumption.ts               # Motor FIFO (vacaciones + cash-out)
│   ├── reports/
│   │   └── monthly.ts                    # Generación de reporte mensual
│   └── utils/
│       └── dates.ts                      # Helpers de fecha
├── prisma/
│   ├── schema.prisma                     # Esquema (SQLite dev, PostgreSQL prod)
│   ├── seed.ts                           # Datos iniciales
│   └── dev.db                            # Base de datos SQLite (dev only)
├── types/index.ts                        # Tipos TypeScript
├── public/woden-logo.png                 # Logo Woden
└── .env                                  # Variables de entorno
```

## Navegación (Header)

Menús desplegables agrupados (click para abrir, responsive con acordeón en móvil):

| Menú | Opciones |
|------|----------|
| **Solicitudes** | Solicitud de Vacaciones, Retorno Anticipado, Días en Dinero, Aprobaciones |
| **Gestión** | Empleados, Saldos, Reportes |
| **Personal** | Organigrama, Solicitud de Personal, Panel de Personal |
| **Configuraciones** | Configuración, Respaldos, Contraseña |

## Modelos de Datos (Prisma)

### Employee
Campos: `id, employeeCode, fullName, email, hireDate, terminationDate?, costCenter, costCenterDesc, supervisorName, supervisorEmail, position`

**Regla**: Si `position` es "Gerente General" o "Country Manager", el supervisor es el mismo empleado. Enforzado en frontend (auto-set al cambiar cargo) y backend (POST/PATCH ignoran supervisor enviado y lo fuerzan a self).

### VacationRequest
Campos: `id, employeeId, employeeName, employeeCode, employeeEmail, supervisorName, supervisorEmail, dateFrom, dateTo, totalDays, status, currentApprovalLevel, powerAutomateFlowId?, cancelledAt?, cancelReason?`

Status: `PENDIENTE → NIVEL_1_PENDIENTE → NIVEL_2_PENDIENTE → NIVEL_3_PENDIENTE → APROBADA | RECHAZADA | CANCELADA`

### VacationCashOutRequest
Campos: `id, employeeId, employeeName, employeeCode, employeeEmail, supervisorName, supervisorEmail, daysRequested, status, currentApprovalLevel`

- Máximo 15 días por periodo de devengamiento
- FIFO: cash-out tiene prioridad sobre vacaciones programadas futuras
- Al aprobar cash-out: temporalmente revierte consumos de vacaciones futuras, ejecuta FIFO cash-out, re-aplica vacaciones

### VacationAccrual
Campos: `id, employeeId, accrualYear, accrualStartDate, accrualEndDate, monthlyRate(2.5), monthsAccrued, totalDaysAccrued, totalDaysConsumed, remainingBalance`

### VacationConsumption
Campos: `id, accrualId, vacationRequestId?, cashOutRequestId?, daysConsumed, consumedAt`

Polimórfico: referencia a VacationRequest OR VacationCashOutRequest.

### OrgPosition
Campos: `id, positionCode (unique), title, costCenter, costCenterDesc, reportsToEmail, employeeId?, positionType, status, thirdPartyName?, thirdPartyCompany?`

- `positionType`: `REGULAR` | `TERCERO`
- `status`: `VACANTE` | `OCUPADA` | `INACTIVA`
- `reportsToEmail` ancla la posición en el árbol del organigrama
- `employeeId` nullable: null = vacante, not null = ocupada
- Auto-generated `positionCode`: POS-0001, POS-0002, etc.

### StaffRequest
Campos: `id, requestType, positionId?, positionTitle, costCenter, costCenterDesc, reportsToEmail, positionType, justification, requestedByEmail, requestedByName, supervisorName, supervisorEmail, status, currentApprovalLevel, approvedAt?, hiredEmployeeId?, hiredAt?, cancelledAt?, cancelReason?`

- `requestType`: `NUEVA_POSICION` | `CONTRATACION`
- Status: misma progresión que vacaciones → `NIVEL_1_PENDIENTE → NIVEL_2_PENDIENTE → NIVEL_3_PENDIENTE → APROBADA | RECHAZADA | CANCELADA`
- Al aprobar NUEVA_POSICION en nivel 3: auto-crea OrgPosition con status VACANTE
- KPI: `timeToHire = hiredAt - approvedAt` (en días calendario)

### Otros modelos
- **EarlyReturnRequest** — retorno anticipado con justificaciones
- **ApprovalRecord** — registro de cada decisión de aprobación (soporta tipos: VACACIONES, RETORNO_ANTICIPADO, VACACIONES_DINERO, NUEVA_POSICION, CONTRATACION)
- **SystemConfiguration** — configuración del sistema, roles, contraseñas
- **BalanceAdjustment** — auditoría de ajustes manuales
- **CostCenter** — catálogo de centros de costos
- **BiometricRecord** — registros biométricos

## FIFO Consumption Engine

### Vacaciones regulares: `consumeVacationDaysFIFO()`
```
ORDER BY accrualYear ASC → consume del más antiguo primero
```

### Cash-out: `consumeCashOutDaysFIFO()`
```
1. Reversar consumos de vacaciones FUTURAS programadas (no iniciadas)
2. Ejecutar FIFO cash-out con tope de 15 días/periodo
3. Re-aplicar consumos de vacaciones vía FIFO regular
```

### Disponibilidad cash-out: `getAvailableCashOut()`
Calcula saldo efectivo por periodo considerando vacaciones programadas.

## API Endpoints para Power Automate

Todos autenticados via header `x-webhook-secret` (valor de `WEBHOOK_SIGNING_SECRET` en .env).

### GET /api/reportes/mensual?month=YYYY-MM
Reporte mensual por supervisor. Defaults al mes anterior.

Respuesta: `{ reportMonth, reportMonthLabel, generatedAt, supervisors[] }` donde cada supervisor tiene `employees[]` con:
- `balanceByPeriod[]` — saldo por periodo (devengado, consumido, restante)
- `movements.vacacionesTomadas[]` — vacaciones consumidas en el mes
- `movements.vacacionesEnDinero[]` — cash-out del mes
- `movements.ajustesManuales[]` — ajustes manuales del mes
- `movements.devengamientoDelMes[]` — incremento de devengamiento del mes

### GET /api/alertas/vencidas
Vacaciones con más de 12 meses de antigüedad y saldo > 0.

Respuesta: `{ cutoffDate, countryManagerEmail, totalOverdueEmployees, totalOverdueDays, supervisors[] }` donde cada supervisor tiene `employees[]` con `overduePeriods[]`.

### POST /api/empleados/supervisores
Sincronización masiva desde O365. Acepta `{ employees: [{ email, supervisorName, supervisorEmail, fullName?, position? }] }`.

## Power Automate Flows (Configuración)

### 1. Sync O365 (diario)
Trigger: Recurrencia diaria 06:00 AM Lima
- Microsoft Graph → Get users + Get manager
- HTTP POST → `/api/empleados/supervisores` con `x-webhook-secret`

### 2. Reporte Mensual (1er día del mes)
Trigger: Recurrencia 1er día del mes 08:00 AM Lima
- HTTP GET → `/api/reportes/mensual` con `x-webhook-secret`
- Apply to each supervisor → Send email (O365 Outlook)

### 3. Alerta Vacaciones Vencidas (semanal)
Trigger: Recurrencia lunes 09:00 AM Lima
- HTTP GET → `/api/alertas/vencidas` con `x-webhook-secret`
- Condition: `totalOverdueEmployees > 0`
- Apply to each supervisor → Send email To: supervisor, CC: `countryManagerEmail`

## Aprobación In-App — 3 Niveles

```
Solicitud creada (NIVEL_1_PENDIENTE)
  → Nivel 1: Supervisor directo (match por email)
  → Nivel 2: RRHH (rol RRHH o ANALISTA_RRHH_EMAIL en config)
  → Nivel 3: Gerente General (rol GERENTE_PAIS o GERENTE_PAIS_EMAIL en config)
  → APROBADA → Consumo FIFO automático
```

Soporta: VACACIONES, RETORNO_ANTICIPADO, VACACIONES_DINERO, NUEVA_POSICION, CONTRATACION.

Los aprobadores de nivel 2+ pueden devolver al nivel anterior.

### Aprobación de Personal
- NUEVA_POSICION: al aprobar en nivel 3, auto-crea OrgPosition con status VACANTE
- CONTRATACION: al aprobar, la posición queda lista para asignar empleado
- Registro de contratación: PATCH `/api/solicitudes-personal/[id]` con `hiredEmployeeId` y `hiredAt`
- Al registrar contratación: auto-marca OrgPosition como OCUPADA

## Restricciones Absolutas

### Reglas de Negocio
- **30 días de anticipación** para solicitudes de vacaciones
- **Consumo FIFO obligatorio** — siempre del periodo más antiguo
- **15 días máximo** de cash-out por periodo de devengamiento
- **Cash-out FIFO con prioridad** sobre vacaciones futuras programadas
- **Aprobación secuencial** — Supervisor → RRHH → Gerente General
- **50 palabras mínimas** en justificaciones de retorno anticipado
- **Interfaz en español** — todo texto visible en es-PE
- **Organigrama restringido por rol** — SUPERVISOR/USUARIO ven solo su subárbol; RRHH/GERENTE_PAIS/ADMINISTRADOR ven todo

### Reglas Técnicas
- **NUNCA** almacenar credenciales en código fuente
- **NUNCA** permitir solicitudes duplicadas
- **SIEMPRE** validar saldo antes de aprobar
- **NUNCA** usar `any` en TypeScript
- Logging: `console.log([MODULO] ACCION: detalle)`

## Variables de Entorno

```bash
DATABASE_URL=postgresql://...       # PostgreSQL en producción
WEBHOOK_SIGNING_SECRET=...          # Secret para endpoints Power Automate
NEXT_PUBLIC_APP_URL=https://...     # URL pública de la app
APP_TIMEZONE=America/Lima
```

## SystemConfiguration Keys

| Key | Descripción |
|-----|-------------|
| `GERENTE_PAIS_EMAIL` | Email del Gerente General (aprobador nivel 3) |
| `GERENTE_PAIS_NOMBRE` | Nombre del Gerente General |
| `ANALISTA_RRHH_EMAIL` | Email del analista RRHH (aprobador nivel 2) |
| `ANALISTA_RRHH_NOMBRE` | Nombre del analista RRHH |
| `USER_ROLE_<email>` | Rol del usuario |
| `USER_PASSWORD_<email>` | Hash SHA-256 de la contraseña |
| `USER_MUST_CHANGE_PWD_<email>` | Forzar cambio de contraseña |
| `DIAS_ALERTA_RETRASO` | Días hábiles para alerta de retraso (default: 3) |
| `DIAS_CANCELACION_AUTO` | Días antes para cancelación automática (default: 7) |
