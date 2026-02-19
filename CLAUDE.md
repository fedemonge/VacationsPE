# VacationsPE - Sistema de Gestión de Vacaciones

> Sistema de gestión de vacaciones para Perú, alojado en AWS Amplify, con flujos de aprobación via Power Automate (Office 365)

## Descripción General

Sistema web y móvil que gestiona solicitudes de vacaciones, retornos anticipados, control de saldo de días de vacaciones con lógica FIFO por periodo de devengamiento, y flujos de aprobación de 3 niveles integrados con Power Automate. Toda la interfaz de usuario está en español (es-PE).

### Funcionalidades Principales
- Formulario de solicitud de vacaciones con validación de 30 días de anticipación
- Formulario de retorno anticipado con justificación obligatoria de 50+ palabras
- Gestión de población de empleados (alta manual, importación CSV, interfaz biométrica)
- Control de saldo de vacaciones con devengamiento mensual y consumo FIFO
- Flujo de aprobación de 3 niveles via Power Automate (Supervisor → Analista RRHH → Gerente País)
- Dashboards de seguimiento de aprobaciones, saldos y antigüedad de vacaciones
- Alertas automáticas por email para aprobaciones retrasadas
- Cancelación automática de solicitudes no aprobadas a tiempo
- Reportes por centro de costos y a nivel compañía

## Restricciones Absolutas

### Reglas de Negocio
- **Anticipación mínima de 30 días**: Los selectores de fecha de inicio deben estar deshabilitados para fechas < hoy + 30 días. Sin excepciones.
- **Consumo FIFO obligatorio**: El saldo de vacaciones de diferentes periodos de devengamiento NUNCA se acumula. El consumo siempre deduce del periodo más antiguo primero.
- **Aprobación secuencial de 3 niveles**: La aprobación debe seguir el orden Supervisor → Analista RRHH → Gerente País. No se puede saltar niveles.
- **Justificación de retorno anticipado**: Tanto el solicitante como el aprobador de 1er nivel DEBEN justificar en mínimo 50 palabras. El formulario debe contar palabras en tiempo real y bloquear el envío si no se cumple.
- **Cancelación automática**: Si fecha_inicio - 7 días se alcanza sin aprobación completa, la solicitud se cancela automáticamente.
- **Interfaz en español**: Todo el texto visible al usuario debe estar en español (es-PE). Sin excepciones.

### Reglas Técnicas
- **NUNCA** almacenar credenciales en código fuente — todo en .env
- **NUNCA** permitir solicitudes duplicadas para el mismo periodo por el mismo empleado
- **SIEMPRE** validar saldo disponible antes de aprobar una solicitud
- **SIEMPRE** registrar toda acción en la tabla de auditoría

## Tech Stack

```
Frontend:     Next.js 14+ (App Router) + TypeScript + Tailwind CSS
Backend:      Next.js API Routes
Database:     PostgreSQL con Prisma ORM (AWS RDS)
Hosting:      AWS Amplify (SSR nativo para Next.js)
Integración:  Power Automate via HTTP webhooks (trigger + callback)
Email:        Amazon SES
Scheduler:    AWS EventBridge (verificación de aprobaciones, auto-cancelación, reportes mensuales)
Auth:         AWS Cognito (autenticación de empleados)
i18n:         Español (locale es-PE), todas las cadenas de UI en español
```

## Branding y Diseño Visual

### Identidad Visual — Woden Colombia
Todas las pantallas, formularios y dashboards deben seguir el branding de **www.woden.com.co**:

```
Logo:                     woden-logo-1.png (obtener de www.woden.com.co)
Color Primario:           #EA7704 (naranja Woden)
Color Primario Hover:     #D06A03
Color de Fondo:           #FFFFFF (blanco)
Color de Fondo Secciones: rgba(234, 119, 4, 0.15) (naranja transparente para secciones alternas)
Color de Texto:           #1F2937 (gris oscuro)
Color de Texto Secundario:#6B7280 (gris medio)
Color de Éxito:           #10B981 (verde)
Color de Alerta:          #F59E0B (amarillo)
Color de Error:           #EF4444 (rojo)
Border Radius:            1px (consistente con Woden)
```

### Componentes de Diseño
- **Header**: Navegación fija (sticky) con logo Woden a la izquierda, menú de opciones a la derecha
- **Botones primarios**: Fondo #EA7704, texto blanco, hover #D06A03
- **Tarjetas/Cards**: Fondo blanco, sombra sutil, border-radius 1px
- **Formularios**: Labels en gris oscuro, inputs con borde gris claro, focus con borde #EA7704
- **Secciones alternas**: Alternar entre fondo blanco y fondo naranja transparente
- **Tablas de datos**: Header con fondo #EA7704 y texto blanco
- **Badges de estado**: Verde (aprobado), naranja (pendiente), rojo (rechazado/cancelado)
- **Mobile**: Diseño responsive, menú hamburguesa en móvil

### Tailwind Config Woden
```typescript
// tailwind.config.ts - colores personalizados
colors: {
  woden: {
    primary: '#EA7704',
    'primary-hover': '#D06A03',
    'primary-light': 'rgba(234, 119, 4, 0.15)',
    'primary-lighter': 'rgba(234, 119, 4, 0.05)',
  }
}
```

## Estructura del Proyecto

```
VacationsPE/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Layout principal con header Woden
│   ├── page.tsx                      # Página de inicio / login
│   ├── (auth)/                       # Páginas de autenticación
│   │   └── login/
│   ├── solicitudes/                  # Formulario de solicitud de vacaciones
│   │   ├── page.tsx                  # Formulario principal
│   │   └── [id]/page.tsx            # Detalle de solicitud
│   ├── retorno-anticipado/           # Formulario de retorno anticipado
│   │   └── page.tsx
│   ├── empleados/                    # Gestión de empleados
│   │   ├── page.tsx                  # Lista + importación CSV
│   │   └── [id]/page.tsx            # Detalle de empleado
│   ├── panel/                        # Dashboards
│   │   ├── aprobaciones/            # Seguimiento de flujo de aprobación
│   │   │   └── page.tsx
│   │   ├── saldos/                  # Dashboard de saldos de vacaciones
│   │   │   └── page.tsx
│   │   └── reportes/               # Reportes (antigüedad, tiempos de aprobación)
│   │       └── page.tsx
│   ├── configuracion/               # Tabla de configuración del sistema
│   │   └── page.tsx
│   └── api/
│       ├── solicitudes/             # CRUD solicitudes de vacaciones
│       │   ├── route.ts             # GET (lista) + POST (crear)
│       │   └── [id]/route.ts        # GET (detalle) + PATCH (actualizar)
│       ├── retorno-anticipado/      # CRUD retorno anticipado
│       │   └── route.ts
│       ├── empleados/               # CRUD empleados + importación CSV
│       │   ├── route.ts
│       │   ├── [id]/route.ts
│       │   └── importar/route.ts    # POST importación CSV
│       ├── aprobaciones/            # Webhooks de aprobación
│       │   ├── trigger/route.ts     # Trigger a Power Automate
│       │   └── callback/route.ts    # Callback de Power Automate
│       ├── saldos/                  # Cálculos de saldo
│       │   ├── route.ts             # GET saldo por empleado
│       │   └── recalcular/route.ts  # POST recálculo mensual
│       ├── reportes/                # Generación de reportes
│       │   └── route.ts
│       ├── biometrico/              # Interfaz de reloj biométrico
│       │   └── route.ts             # POST recepción de datos
│       └── configuracion/           # CRUD configuración del sistema
│           └── route.ts
├── lib/
│   ├── balance/
│   │   ├── accrual.ts               # Cálculo de devengamiento mensual
│   │   ├── consumption.ts           # Motor de consumo FIFO
│   │   └── reconciliation.ts        # Cruce vs biométrico
│   ├── power-automate/
│   │   ├── trigger.ts               # Envío de webhook a Power Automate
│   │   └── callback.ts              # Procesamiento de respuesta
│   ├── email/
│   │   ├── templates/               # Plantillas HTML de email (español)
│   │   │   ├── aprobacion.ts        # Notificación de aprobación/rechazo
│   │   │   ├── alerta-retraso.ts    # Alerta de aprobación retrasada
│   │   │   ├── cancelacion.ts       # Notificación de cancelación automática
│   │   │   └── reporte-mensual.ts   # Reporte mensual de tiempos
│   │   └── ses.ts                   # Cliente Amazon SES
│   ├── scheduler/
│   │   ├── check-stuck.ts           # Verificar aprobaciones >3 días hábiles
│   │   ├── auto-cancel.ts           # Cancelar solicitudes vencidas
│   │   └── monthly-report.ts        # Generar reporte mensual día 1
│   ├── csv/
│   │   └── employee-import.ts       # Parser e importador de CSV
│   ├── validators/
│   │   ├── vacation-request.ts      # Validación de solicitud (30 días, saldo)
│   │   ├── early-return.ts          # Validación de retorno (50 palabras)
│   │   └── employee.ts              # Validación de datos de empleado
│   └── utils/
│       ├── dates.ts                 # Helpers de fecha (días hábiles, antigüedad)
│       ├── word-count.ts            # Conteo de palabras para justificaciones
│       └── employee-status.ts       # Clasificación activo/inactivo
├── components/
│   ├── ui/                          # Componentes base (botones, inputs, cards)
│   ├── layout/
│   │   ├── Header.tsx               # Header con logo Woden y navegación
│   │   ├── Sidebar.tsx              # Menú lateral
│   │   └── Footer.tsx               # Pie de página
│   ├── forms/
│   │   ├── VacationRequestForm.tsx  # Formulario de solicitud
│   │   ├── EarlyReturnForm.tsx      # Formulario de retorno anticipado
│   │   └── EmployeeForm.tsx         # Formulario de empleado
│   └── dashboards/
│       ├── ApprovalTracker.tsx       # Seguimiento de aprobaciones
│       ├── BalanceDashboard.tsx      # Dashboard de saldos
│       └── ReportCharts.tsx          # Gráficos de reportes
├── prisma/
│   └── schema.prisma                # Esquema de base de datos
├── types/
│   └── index.ts                     # Definiciones de tipos TypeScript
├── public/
│   └── woden-logo.png               # Logo Woden (descargar de www.woden.com.co)
├── config/
│   └── constants.ts                 # Constantes de configuración
├── .env                             # Variables de entorno (NO commitear)
├── .env.example                     # Plantilla de variables de entorno
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── amplify.yml                      # Configuración de despliegue AWS Amplify
```

## Modelos de Datos

### Employee (Empleado)
```typescript
interface Employee {
  id: string;                        // UUID
  employeeCode: string;              // Código de empleado (único)
  fullName: string;                  // Nombre completo
  email: string;                     // Correo electrónico corporativo
  hireDate: Date;                    // Fecha de ingreso
  terminationDate: Date | null;      // Fecha de cese (null = activo)
  costCenter: string;                // Centro de costos
  supervisorName: string;            // Nombre del supervisor directo
  supervisorEmail: string;           // Email del supervisor directo
  position: string;                  // Cargo
  isActive: boolean;                 // Calculado: activo a la fecha actual
  createdAt: Date;
  updatedAt: Date;
}
```

### VacationRequest (Solicitud de Vacaciones)
```typescript
interface VacationRequest {
  id: string;                        // UUID
  employeeId: string;                // FK → Employee
  employeeName: string;              // Nombre del empleado (capturado al crear)
  employeeCode: string;              // Código del empleado (capturado al crear)
  employeeEmail: string;             // Email del empleado
  supervisorName: string;            // Nombre del supervisor
  supervisorEmail: string;           // Email del supervisor
  dateFrom: Date;                    // Fecha inicio de vacaciones
  dateTo: Date;                      // Fecha fin de vacaciones (día siguiente = retorno)
  totalDays: number;                 // Días calendario del periodo
  status: VacationRequestStatus;     // PENDIENTE | EN_APROBACION | APROBADA | RECHAZADA | CANCELADA
  currentApprovalLevel: number;      // 1 = Supervisor, 2 = RRHH, 3 = Gerente País
  powerAutomateFlowId: string | null;// ID del flujo de Power Automate
  cancelledAt: Date | null;          // Fecha de cancelación automática
  cancelReason: string | null;       // Motivo de cancelación
  createdAt: Date;
  updatedAt: Date;
}

type VacationRequestStatus =
  | 'PENDIENTE'
  | 'NIVEL_1_PENDIENTE'
  | 'NIVEL_2_PENDIENTE'
  | 'NIVEL_3_PENDIENTE'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'CANCELADA';
```

### EarlyReturnRequest (Solicitud de Retorno Anticipado)
```typescript
interface EarlyReturnRequest {
  id: string;                        // UUID
  vacationRequestId: string;         // FK → VacationRequest (periodo activo)
  employeeId: string;                // FK → Employee
  returnDate: Date;                  // Fecha de retorno (dentro del periodo activo)
  employeeJustification: string;     // Justificación del empleado (min 50 palabras)
  approverJustification: string;     // Justificación del aprobador nivel 1 (min 50 palabras)
  status: EarlyReturnStatus;         // PENDIENTE | APROBADA | RECHAZADA
  createdAt: Date;
  updatedAt: Date;
}

type EarlyReturnStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
```

### VacationAccrual (Devengamiento de Vacaciones)
```typescript
interface VacationAccrual {
  id: string;                        // UUID
  employeeId: string;                // FK → Employee
  accrualYear: number;               // Año de devengamiento (ej: 2025, 2026)
  accrualStartDate: Date;            // Fecha inicio del periodo (aniversario de ingreso)
  accrualEndDate: Date;              // Fecha fin del periodo
  monthlyRate: number;               // Tasa mensual (2.5 días/mes = 30/12)
  monthsAccrued: number;             // Meses devengados hasta la fecha
  totalDaysAccrued: number;          // Total días devengados (monthsAccrued × monthlyRate)
  totalDaysConsumed: number;         // Total días consumidos de este periodo
  remainingBalance: number;          // Saldo restante (accrued - consumed)
  createdAt: Date;
  updatedAt: Date;
}
```

### VacationConsumption (Consumo de Vacaciones — Registro FIFO)
```typescript
interface VacationConsumption {
  id: string;                        // UUID
  accrualId: string;                 // FK → VacationAccrual (periodo del cual se consume)
  vacationRequestId: string;         // FK → VacationRequest (solicitud que consume)
  daysConsumed: number;              // Días consumidos de este periodo específico
  consumedAt: Date;                  // Fecha del registro de consumo
}
```

### ApprovalRecord (Registro de Aprobación)
```typescript
interface ApprovalRecord {
  id: string;                        // UUID
  requestId: string;                 // FK → VacationRequest o EarlyReturnRequest
  requestType: 'VACACIONES' | 'RETORNO_ANTICIPADO';
  approverEmail: string;             // Email del aprobador
  approverName: string;              // Nombre del aprobador
  level: number;                     // Nivel de aprobación (1, 2 o 3)
  status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  decidedAt: Date | null;            // Fecha/hora de la decisión
  comments: string | null;           // Comentarios del aprobador
  createdAt: Date;
}
```

### SystemConfiguration (Configuración del Sistema)
```typescript
interface SystemConfiguration {
  id: string;                        // UUID
  key: string;                       // Clave única (ej: 'GERENTE_PAIS_EMAIL')
  value: string;                     // Valor
  description: string;               // Descripción del parámetro
  updatedAt: Date;
  updatedBy: string;                 // Email del último modificador
}

// Claves requeridas:
// GERENTE_PAIS_EMAIL       - Email del Gerente País (aprobador nivel 3)
// GERENTE_PAIS_NOMBRE      - Nombre del Gerente País
// ANALISTA_RRHH_EMAIL      - Email del Analista RRHH (aprobador nivel 2)
// ANALISTA_RRHH_NOMBRE     - Nombre del Analista RRHH
// POWER_AUTOMATE_WEBHOOK   - URL del webhook de Power Automate
// DIAS_ALERTA_RETRASO      - Días hábiles para alerta de retraso (default: 3)
// DIAS_CANCELACION_AUTO    - Días antes de inicio para cancelación automática (default: 7)
```

### BiometricRecord (Registro Biométrico)
```typescript
interface BiometricRecord {
  id: string;                        // UUID
  employeeId: string;                // FK → Employee
  employeeCode: string;              // Código de empleado (para cruce)
  date: Date;                        // Fecha del registro
  clockIn: Date | null;              // Hora de entrada
  clockOut: Date | null;             // Hora de salida
  absenceType: string | null;        // Tipo de ausencia (si aplica)
  source: string;                    // Fuente del dato ('BIOMETRICO' | 'CSV_IMPORT')
  importedAt: Date;                  // Fecha de importación al sistema
}
```

## Lógica de Saldo de Vacaciones y Consumo FIFO

### Devengamiento
- **30 días por año** a razón de **2.5 días por mes** (30 ÷ 12)
- El periodo de devengamiento se calcula desde la fecha de ingreso (aniversario)
- Cada año genera un registro `VacationAccrual` independiente
- El devengamiento se recalcula mensualmente vía EventBridge

### Consumo FIFO (Primero en Entrar, Primero en Salir)
```
Algoritmo de consumo:
1. Recibir: empleadoId, díasSolicitados
2. Consultar VacationAccrual WHERE empleadoId = X AND remainingBalance > 0
   ORDER BY accrualYear ASC (más antiguo primero)
3. Para cada periodo (del más antiguo al más reciente):
   a. diasAConsumir = MIN(diasRestantes, periodo.remainingBalance)
   b. Crear registro VacationConsumption(accrualId, requestId, diasAConsumir)
   c. Actualizar periodo: totalDaysConsumed += diasAConsumir, remainingBalance -= diasAConsumir
   d. diasRestantes -= diasAConsumir
   e. Si diasRestantes == 0: TERMINAR
4. Si diasRestantes > 0 después de recorrer todos los periodos: SALDO INSUFICIENTE
```

### Cruce con Biométrico
- Comparar días de vacaciones aprobadas vs registros de ausencia del reloj biométrico
- Reportar discrepancias: días aprobados sin marca de ausencia, ausencias no justificadas
- Este cruce se ejecuta en el recálculo mensual

### Regla Crítica
> Los saldos de diferentes periodos de devengamiento NUNCA se suman para mostrar un "saldo total".
> Siempre se presentan desglosados por periodo y se consumen en orden cronológico (FIFO).

## Arquitectura del Flujo de Aprobación

### Comunicación App ↔ Power Automate
```
┌──────────────┐    HTTP POST (webhook)    ┌──────────────────┐
│   AWS App     │ ───────────────────────→ │  Power Automate   │
│  (Next.js)    │                          │   (Office 365)    │
│               │ ←─────────────────────── │                   │
│               │    HTTP POST (callback)   │  Flujo de         │
│  /api/aprob.  │                          │  Aprobación       │
│  /callback    │                          │  3 niveles        │
└──────────────┘                           └──────────────────┘
```

### Flujo de Aprobación — 3 Niveles
```
Solicitud Creada
    │
    ▼
[Nivel 1] Supervisor Directo (jerarquía O365)
    │
    ├── Rechazada → Notificar empleado + supervisor → FIN
    │
    ▼ Aprobada
[Nivel 2] Analista RRHH (tabla configuración)
    │
    ├── Rechazada → Notificar empleado + supervisor → FIN
    │
    ▼ Aprobada
[Nivel 3] Gerente País (tabla configuración)
    │
    ├── Rechazada → Notificar empleado + supervisor → FIN
    │
    ▼ Aprobada
Solicitud APROBADA → Registrar consumo FIFO → Notificar empleado + supervisor → FIN
```

### Payload del Webhook a Power Automate
```typescript
interface ApprovalWebhookPayload {
  requestId: string;
  requestType: 'VACACIONES' | 'RETORNO_ANTICIPADO';
  employeeName: string;
  employeeEmail: string;
  supervisorName: string;
  supervisorEmail: string;
  hrAnalystEmail: string;           // Desde SystemConfiguration
  countryManagerEmail: string;      // Desde SystemConfiguration
  dateFrom: string;                 // ISO 8601
  dateTo: string;                   // ISO 8601
  totalDays: number;
  callbackUrl: string;              // URL de callback del app
}
```

### Payload del Callback de Power Automate
```typescript
interface ApprovalCallbackPayload {
  requestId: string;
  level: number;                    // 1, 2 o 3
  status: 'APROBADO' | 'RECHAZADO';
  approverEmail: string;
  approverName: string;
  comments: string | null;
  decidedAt: string;                // ISO 8601
}
```

### Reglas de Temporización
- **Alerta de retraso**: Si una aprobación lleva ≥ 3 días hábiles en un nivel, enviar email a:
  - El aprobador retrasado
  - Analista RRHH
  - Gerente País
- **Cancelación automática**: Si (fecha_inicio - 7 días) se alcanza sin aprobación completa:
  - Cancelar solicitud automáticamente
  - Notificar al empleado y supervisor
  - Registrar motivo: "Cancelada automáticamente por falta de aprobación oportuna"
- **Solicitudes de alta prioridad**: Las solicitudes donde (fecha_inicio - 7 días) está a ≤ 3 días hábiles se marcan como alta prioridad en el dashboard

## Especificación de Formularios

### 1. Formulario de Solicitud de Vacaciones
Ruta: `/solicitudes`

| Campo | Tipo | Validación |
|-------|------|-----------|
| Nombre del Empleado | text (auto-llenado) | Requerido |
| Código de Empleado | text (auto-llenado) | Requerido |
| Email del Empleado | email (auto-llenado) | Requerido, formato email |
| Nombre del Supervisor | text (auto-llenado) | Requerido |
| Email del Supervisor | email (auto-llenado) | Requerido, formato email |
| Fecha Desde | date picker | Requerido, >= hoy + 30 días calendario |
| Fecha Hasta | date picker | Requerido, > Fecha Desde |

**Comportamiento del Date Picker**:
- Todas las fechas anteriores a (hoy + 30 días) deben estar **deshabilitadas y no seleccionables**
- Mostrar mensaje informativo: "Las vacaciones deben solicitarse con al menos 30 días de anticipación"
- El campo "Fecha Hasta" debe ser posterior a "Fecha Desde"

**Al enviar**:
1. Validar saldo de vacaciones disponible (FIFO)
2. Crear registro VacationRequest con status PENDIENTE
3. Disparar webhook a Power Automate
4. Mostrar confirmación con número de solicitud

### 2. Formulario de Retorno Anticipado
Ruta: `/retorno-anticipado`

| Campo | Tipo | Validación |
|-------|------|-----------|
| Periodo de Vacaciones Activo | select/dropdown | Mostrar solo periodos APROBADOS en curso |
| Fecha de Retorno | date picker | Debe estar dentro del periodo activo seleccionado |
| Justificación del Empleado | textarea | Requerido, mínimo 50 palabras |
| Justificación del Aprobador Nivel 1 | textarea | Requerido, mínimo 50 palabras |

**Comportamiento**:
- Mostrar solo vacaciones con estado APROBADA y cuya fecha actual esté dentro del rango (dateFrom, dateTo)
- Date picker de retorno limitado al rango del periodo activo seleccionado
- Contador de palabras en tiempo real debajo de cada textarea de justificación
- Botón de envío deshabilitado hasta que ambas justificaciones tengan ≥ 50 palabras
- Formato del contador: "X / 50 palabras mínimas" (verde si >= 50, rojo si < 50)

## Clasificación de Empleados

### Activo en una fecha específica
```typescript
function isActiveOnDate(employee: Employee, date: Date): boolean {
  return employee.hireDate <= date
    && (employee.terminationDate === null || employee.terminationDate >= date);
}
```

### Activo en un mes
Un empleado se considera activo en un mes si:
1. Está activo al último día del mes, **O**
2. Ha trabajado al menos un día durante ese mes

```typescript
function isActiveInMonth(employee: Employee, year: number, month: number): boolean {
  const monthEnd = lastDayOfMonth(new Date(year, month - 1));
  const monthStart = new Date(year, month - 1, 1);

  // Activo al cierre del mes
  if (isActiveOnDate(employee, monthEnd)) return true;

  // Trabajó al menos un día en el mes
  return employee.hireDate <= monthEnd
    && (employee.terminationDate === null || employee.terminationDate >= monthStart);
}
```

## Dashboards y Reportes

### 1. Dashboard de Seguimiento de Aprobaciones
Ruta: `/panel/aprobaciones`
- Vista de todas las solicitudes pendientes con nivel actual de aprobación
- **Lista destacada**: solicitudes de alta prioridad (fecha_inicio - 7 días ≤ 3 días hábiles) con fondo naranja Woden
- Filtros: estado, empleado, fecha, centro de costos
- Email automático cuando aprobación retrasada ≥ 3 días hábiles

### 2. Dashboard de Saldos de Vacaciones
Ruta: `/panel/saldos`
- Saldo desglosado por periodo de devengamiento (año)
- Días devengados, días consumidos, saldo restante por periodo
- Antigüedad del saldo (aging) con código de colores
- Filtro por centro de costos y vista total compañía

### 3. Reportes
Ruta: `/panel/reportes`

| Reporte | Disponibilidad | Distribución |
|---------|---------------|-------------|
| Tiempo total de aprobación | Bajo demanda | Web |
| Tiempo de aprobación por aprobador | Bajo demanda + 1er día del mes | Web + Email al Gerente País |
| Antigüedad de vacaciones por periodo | Bajo demanda | Web |
| Días tomados por periodo | Bajo demanda | Web |
| Días devengados por periodo | Bajo demanda | Web |

- Todos los reportes deben poder filtrarse por **centro de costos** y **total compañía**
- El reporte mensual automático se envía el 1er día del mes siguiente vía Amazon SES

## Notificaciones por Email

### Matriz de Notificaciones
| Evento | Destinatarios | Plantilla |
|--------|---------------|-----------|
| Solicitud creada | Empleado, Supervisor | aprobacion.ts |
| Aprobación nivel 1 | Empleado, Supervisor | aprobacion.ts |
| Aprobación nivel 2 | Empleado, Supervisor | aprobacion.ts |
| Aprobación final (nivel 3) | Empleado, Supervisor | aprobacion.ts |
| Rechazo (cualquier nivel) | Empleado, Supervisor | aprobacion.ts |
| Aprobación retrasada (≥3 días hábiles) | Aprobador retrasado, Analista RRHH, Gerente País | alerta-retraso.ts |
| Cancelación automática | Empleado, Supervisor | cancelacion.ts |
| Reporte mensual (1er día del mes) | Gerente País | reporte-mensual.ts |

Todos los emails en español. Incluir logo Woden en header del email.

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/solicitudes | Crear solicitud de vacaciones |
| GET | /api/solicitudes | Listar solicitudes (filtros: empleado, estado, fecha) |
| GET | /api/solicitudes/[id] | Detalle de una solicitud |
| PATCH | /api/solicitudes/[id] | Actualizar estado de solicitud |
| POST | /api/retorno-anticipado | Crear solicitud de retorno anticipado |
| GET | /api/retorno-anticipado | Listar retornos anticipados |
| POST | /api/empleados | Crear empleado |
| GET | /api/empleados | Listar empleados (filtros: activo, centro de costos) |
| GET | /api/empleados/[id] | Detalle de empleado |
| PATCH | /api/empleados/[id] | Actualizar empleado |
| POST | /api/empleados/importar | Importar empleados desde CSV |
| POST | /api/aprobaciones/trigger | Disparar flujo de aprobación en Power Automate |
| POST | /api/aprobaciones/callback | Recibir resultado de aprobación de Power Automate |
| GET | /api/saldos | Obtener saldos de vacaciones por empleado |
| POST | /api/saldos/recalcular | Recalcular saldos mensuales (EventBridge) |
| GET | /api/reportes | Generar reportes (parámetros: tipo, centro_costos, periodo) |
| POST | /api/biometrico | Recibir datos del reloj biométrico |
| GET | /api/configuracion | Obtener configuración del sistema |
| PATCH | /api/configuracion | Actualizar configuración del sistema |

## Variables de Entorno

```bash
# ===== Base de Datos (AWS RDS PostgreSQL) =====
DATABASE_URL=postgresql://usuario:contraseña@host:5432/vacaciones_pe

# ===== AWS General =====
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# ===== AWS Amplify =====
AMPLIFY_APP_ID=
NEXT_PUBLIC_APP_URL=https://vacaciones.tudominio.com

# ===== AWS Cognito =====
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=

# ===== Amazon SES =====
SES_FROM_EMAIL=vacaciones@tudominio.com
SES_REGION=us-east-1

# ===== Power Automate =====
POWER_AUTOMATE_WEBHOOK_URL=https://prod-xx.westus.logic.azure.com/workflows/...
POWER_AUTOMATE_CALLBACK_SECRET=clave_secreta_para_validar_callbacks

# ===== AWS EventBridge =====
EVENTBRIDGE_RULE_ARN=

# ===== Aplicación =====
APP_TIMEZONE=America/Lima
APP_LOCALE=es-PE
VACATION_DAYS_PER_YEAR=30
MONTHLY_ACCRUAL_RATE=2.5
ADVANCE_DAYS_REQUIRED=30
AUTO_CANCEL_DAYS_BEFORE=7
STUCK_APPROVAL_ALERT_DAYS=3

# ===== Seguridad =====
API_SECRET_KEY=clave_secreta_para_apis_internas
WEBHOOK_SIGNING_SECRET=clave_para_firmar_webhooks
```

## Estándares de Código

### TypeScript
- Modo estricto habilitado (`strict: true`)
- Tipos de retorno explícitos en todas las funciones
- Prohibido el uso de `any` — usar tipos definidos en `types/`
- Validación con Zod para datos de entrada (formularios, CSV, webhooks)

### Convenciones de Nombrado
- **Variables y funciones**: camelCase en inglés (código interno)
- **Componentes React**: PascalCase
- **Rutas de API**: kebab-case en español (ej: `/api/retorno-anticipado`)
- **Tablas de BD**: PascalCase via Prisma (ej: `VacationRequest`)
- **UI labels y mensajes**: Todo en español

### Manejo de Errores
- Todas las llamadas a Power Automate envueltas en try/catch
- Errores de validación retornan 400 con mensaje en español
- Errores de servidor retornan 500 con log interno (no exponer detalles)
- Registrar todos los errores con contexto suficiente para debug

### Patrón de Logging
```typescript
console.log(`[${modulo}] ${accion}: ${detalle}`);
// Ejemplo: [APROBACION] WEBHOOK_ENVIADO: solicitud abc-123 nivel 1
// Ejemplo: [SALDO] CONSUMO_FIFO: empleado emp-456, 5 días del periodo 2024
// Ejemplo: [BIOMETRICO] IMPORTACION: 150 registros procesados
```

## Comportamientos No Negociables

1. **NUNCA** permitir solicitudes de vacaciones con menos de 30 días de anticipación
2. **NUNCA** acumular saldos de diferentes periodos de devengamiento
3. **SIEMPRE** consumir saldo FIFO (periodo más antiguo primero)
4. **NUNCA** aprobar una solicitud sin saldo suficiente validado
5. **SIEMPRE** requerir justificación de 50+ palabras (empleado Y aprobador) para retornos anticipados
6. **SIEMPRE** seguir la secuencia de aprobación de 3 niveles sin saltarse niveles
7. **SIEMPRE** cancelar automáticamente si fecha_inicio - 7 días se alcanza sin aprobación
8. **SIEMPRE** enviar alertas cuando una aprobación lleve ≥ 3 días hábiles en un nivel
9. **NUNCA** mostrar texto en idioma diferente al español en la interfaz de usuario
10. **SIEMPRE** notificar por email al empleado y supervisor del resultado de la aprobación

## Referencia Rápida

### Ciclo de Vida de una Solicitud de Vacaciones
```
1. Empleado completa formulario de solicitud
2. Sistema valida:
   a. Fecha inicio >= hoy + 30 días
   b. Saldo disponible suficiente (consulta FIFO)
   c. No hay solicitud duplicada para el mismo periodo
3. Se crea VacationRequest con status PENDIENTE
4. Se dispara webhook a Power Automate
5. Power Automate gestiona aprobación secuencial:
   a. Nivel 1: Supervisor → Callback a /api/aprobaciones/callback
   b. Nivel 2: Analista RRHH → Callback
   c. Nivel 3: Gerente País → Callback
6. En cada callback:
   a. Se registra ApprovalRecord
   b. Si RECHAZADO: actualizar status, notificar, FIN
   c. Si APROBADO nivel 3: registrar consumo FIFO, notificar, FIN
7. EventBridge verifica diariamente:
   a. Aprobaciones retrasadas → email de alerta
   b. Solicitudes por vencer → cancelación automática
```

### Flujo de Consumo FIFO
```
Solicitud aprobada: 10 días

Periodos disponibles (ORDER BY accrualYear ASC):
┌──────────┬──────────┬───────────┬──────────┐
│ Periodo  │ Devengado│ Consumido │  Saldo   │
├──────────┼──────────┼───────────┼──────────┤
│ 2024     │ 30.0     │ 27.0      │  3.0     │ ← Se consumen 3.0 días
│ 2025     │ 30.0     │  5.0      │ 25.0     │ ← Se consumen 7.0 días restantes
│ 2026     │ 12.5     │  0.0      │ 12.5     │
└──────────┴──────────┴───────────┴──────────┘

Resultado:
- VacationConsumption(accrualId=2024, days=3.0)
- VacationConsumption(accrualId=2025, days=7.0)
- Periodo 2024: saldo 0.0 (agotado)
- Periodo 2025: saldo 18.0
```
