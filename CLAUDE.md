# SistemasWoden - Sistema de Gestión Empresarial

> Plataforma multi-módulo para gestión de Capital Humano, Planilla Perú, FEC y Recupero. Alojado en AWS Amplify con integración Power Automate (Office 365).

## Descripción General

Sistema web empresarial con los siguientes módulos:
1. **Vacaciones** — solicitudes, aprobaciones 3 niveles, saldos FIFO, reportes, organigrama, personal
2. **Planilla Peru** — cálculo de planilla, asistencia, lotes BBVA, parámetros legales peruanos
3. **FEC** — pipeline Kanban de ideas de ahorro/uso, reportes XLSX/PDF, tipos de cambio, empresas
4. **Recupero** — control de gestiones de campo para recuperación de equipos (Claro, DirecTV, Mi Fibra)

Interfaz en español (es-PE). Autenticación cookie-based con SHA-256.

---

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
Clases Tailwind custom:   .card, .btn-primary, .input-field, .table-header, .table-cell
Border Radius:            1px (rounded-sm)
```

---

## Autenticación y Roles

Auth is cookie-based. User roles stored in `SystemConfiguration` with key `USER_ROLE_<email>`. Passwords stored as SHA-256 hashes with key `USER_PASSWORD_<email>`.

Additionally, per-user menu grants are stored in `UserMenuGrant` model — allows admin/security officer to grant additional paths beyond role defaults.

### Roles del Sistema

| Role | Internal Key | Descripción |
|------|-------------|-------------|
| Usuario | `USUARIO` | Solicitudes vacaciones, organigrama, FEC básico |
| Supervisor | `SUPERVISOR` | + Aprobaciones, saldos, reportes, personal |
| RRHH | `RRHH` | + Empleados, planilla Peru |
| Gerente General | `GERENTE_PAIS` | + Configuración, planilla Peru |
| Oficial de Seguridad | `OFICIAL_SEGURIDAD` | Gestión usuarios/roles, reportes, sin planilla |
| Administrador | `ADMINISTRADOR` | Todo incluyendo FEC admin, backups |

**Nota**: `GERENTE_PAIS` → "Gerente General" en UI. `OFICIAL_SEGURIDAD` → "Oficial de Seguridad".

### Administrador por defecto
- `fmonge@woden.com.pe` — ADMINISTRADOR (con contraseña SHA-256)

---

## Navegación (Header)

Menús desplegables. "Vacaciones" es un **mega-menu** de 4 columnas.

| Menú | Sub-grupos / Opciones |
|------|-----------------------|
| **Vacaciones** | *Solicitudes*: Solicitud de Vacaciones, Retorno Anticipado, Días en Dinero, Aprobaciones |
| | *Gestión*: Empleados, Saldos, Reportes |
| | *Personal*: Organigrama, Solicitud de Personal, Panel de Personal |
| | *Configuración*: Parámetros y Usuarios (`/configuracion`) |
| **Planilla Peru** | Calcular Planilla, Periodos, Asistencia, Lotes de Pago, Excepciones |
| **FEC** | Pipeline de Ideas, Reportes FEC, Admin FEC |
| **Configuración** | Respaldos, Contraseña |

`getSectionName()` en Header.tsx usa `usePathname()` para mostrar el módulo activo junto al logo.

---

## Página de Configuración (`/configuracion`)

Organizada en 3 pestañas:

### Pestaña "Vacaciones"
- `GERENTE_PAIS_EMAIL`, `GERENTE_PAIS_NOMBRE` — Aprobador nivel 3
- `ANALISTA_RRHH_EMAIL`, `ANALISTA_RRHH_NOMBRE` — Aprobador nivel 2
- `POWER_AUTOMATE_WEBHOOK` — URL del webhook
- `DIAS_ALERTA_RETRASO`, `DIAS_CANCELACION_AUTO`

### Pestaña "Planilla Peru"
- `TOLERANCIA_TARDANZA_MINUTOS`, `JEFE_FINANCIERO_EMAIL/NOMBRE`, `BBVA_RUC_EMPRESA`, `BBVA_RAZON_SOCIAL`
- Gestión completa de Centros de Costos (CRUD + importación CSV/XLSX)

### Pestaña "Global"
- Gestión de usuarios y roles (Admin y Oficial de Seguridad)
- Asignación de grants de menú por usuario (`UserMenuGrant`)
- Tabla de parámetros del sistema (claves no categorizadas)

---

## Módulo FEC (Financiando el Crecimiento)

### Modelos FEC en Prisma
- **FecCompany**: Empresas (código, moneda, país). Ej: WODEN-PE (PEN), WODEN-CO (COP), WODEN-CR (CRC)
- **FecArea**: Áreas (Comercial, Finanzas, Logística, Operaciones, RRHH)
- **FecRoleAssignment**: Asignación de roles FEC por empleado y área (`ANALISTA_FINANCIERO` global, `RESPONSABLE_AREA` por área)
- **FecIdea**: Idea con 12 meses de valores en moneda local + 12 meses en USD
- **FecStatusHistory**: Historial de cambios de estado
- **FecExchangeRate**: Tipo de cambio local→USD por moneda y periodo YYYY-MM
- **FecUserCompanyAccess**: Acceso de empleados a empresas FEC
- **FecFinancialLine**: Catálogo de líneas financieras por tipo (PL/BS/CF) — 15 seed entries

### Monedas soportadas
`USD | PEN | COP | BRL | EUR | MXN | CRC`

### Valores calculados en FecIdea
- `annualizedValue` = (suma / meses con valor) × 12
- `effectiveValue` = suma de los 12 meses
- `_Usd` equivalentes calculados automáticamente al guardar via exchange rates

### Status de ideas
`ESTUDIAR → FIRME → IMPLEMENTADA | CANCELADA | SUSPENDIDA`

### Roles FEC
- `ANALISTA_FINANCIERO` — acceso global a todas las empresas
- `RESPONSABLE_AREA` — acceso a su área específica

### Páginas FEC
- `/fec` — Pipeline Kanban con KPIs duales (local + USD), filtro por empresa, modal de creación
- `/fec/idea` — Detalle con grilla 12 meses (moneda proyecto + USD), tabs de estado/historial
- `/fec/reportes` — Reportes con filtros (Empresa/Año/Mes/Status), descarga XLSX (colores Woden) y PDF
- `/fec/admin` — 6 pestañas: Áreas, Roles, Empresas, Tipos de Cambio, Lineas Financieras, Acceso Usuarios

### API Routes FEC
```
/api/fec/ideas              GET (filtros: companyId, status) / POST
/api/fec/ideas/[id]         GET / PATCH (con permisos por rol)
/api/fec/ideas/[id]/approve POST (aprobación analista)
/api/fec/areas              GET / POST
/api/fec/roles              GET / POST / DELETE
/api/fec/companies          GET / POST
/api/fec/exchange-rates     GET / POST (upsert por moneda+periodo)
/api/fec/user-access        GET / POST / DELETE
/api/fec/financial-lines    GET (filtro: type=PL|BS|CF) / POST / DELETE (soft)
/api/fec/reports            GET (type=upcoming|monthly|overdue)
/api/fec/alerts             GET (ideas próximas 30 días)
```

---

## Módulo Planilla Peru

### Modelos Prisma (Planilla)
- **PayrollPeriod**: Periodos de planilla con estado
- **PayrollEntry**: Liquidación individual por empleado/periodo
- **PayrollParam**: Parámetros legales con vigencia (UIT, RMV, EsSalud, AFP, ONP...)
- **WorkShift**: Turnos de trabajo
- **AttendanceRecord**: Registros de asistencia y tardanza

### Parámetros Legales Perú (seed)
UIT, RMV, ESSALUD_RATE (9%), ONP_RATE (13%), AFP por proveedor (Habitat/Integra/Prima/Profuturo), BONIF_EXTRA_RATE (9%)

### Páginas Planilla
- `/planilla` — Periodos
- `/planilla/calcular` — Cálculo de planilla
- `/planilla/asistencia` — Registro de asistencia
- `/planilla/batches` — Lotes de pago BBVA
- `/planilla/excepciones` — Excepciones de planilla
- `/planilla/[periodId]` — Detalle de periodo
- `/planilla/[periodId]/[employeeId]` — Liquidación individual

---

## Módulo Vacaciones

### Funcionalidades
- Solicitud de vacaciones (30 días de anticipación obligatorio)
- Retorno anticipado (justificación mínima 50 palabras)
- Vacaciones en dinero/cash-out (máx 15 días/periodo, FIFO)
- Aprobación in-app 3 niveles: Supervisor → RRHH → Gerente General
- Saldos FIFO con devengamiento mensual (2.5 días/mes)
- Ajuste manual de saldos
- Organigrama interactivo con posiciones vacantes y terceros
- Solicitudes de personal (nueva posición/contratación) con aprobación 3 niveles
- KPIs de personal, reportes de tendencia

### FIFO Engine
- Vacaciones: `consumeVacationDaysFIFO()` — del periodo más antiguo primero
- Cash-out: revierte vacaciones futuras → cash-out FIFO → re-aplica vacaciones

---

## Estructura de Archivos Clave

```
app/
  fec/
    page.tsx                  # Pipeline Kanban
    idea/page.tsx             # Detalle de idea (grillas duales)
    reportes/page.tsx         # Reportes con XLSX/PDF
    admin/page.tsx            # Administración FEC (6 tabs)
  planilla/
    page.tsx / calcular / asistencia / batches / excepciones
    [periodId]/page.tsx
    [periodId]/[employeeId]/page.tsx
  configuracion/page.tsx      # 3 tabs: Vacaciones | Planilla Peru | Global
  api/
    fec/                      # 10 route files
    planilla/                 # routes de planilla
    user-menu-grants/route.ts # CRUD de permisos de menú por usuario
    auth/route.ts             # Login/logout + devuelve menuGrants[]
components/
  layout/Header.tsx           # Mega-menu Vacaciones + nav dinámica
  AuthProvider.tsx            # hasAccess() verifica rol + menuGrants
lib/
  auth.ts                     # Session, roles, password hashing (incluye OFICIAL_SEGURIDAD)
  balance/                    # Motor FIFO de vacaciones
  payroll/                    # Cálculos de planilla + exportación Odoo
prisma/
  schema.prisma               # 30+ modelos
  seed.ts                     # Datos iniciales completos
types/index.ts                # UserRole (incluye OFICIAL_SEGURIDAD), ROLE_PERMISSIONS, FEC types
```

---

## Modelos Prisma Adicionales

### UserMenuGrant
```
id, userEmail, menuPath, grantedBy, createdAt
@@unique([userEmail, menuPath])
```
Permite al Administrador u Oficial de Seguridad otorgar acceso a rutas específicas más allá del rol base.

### Employee (campos clave)
```
employeeCode, fullName, email, hireDate, position, costCenter
supervisorName, supervisorEmail
documentType, documentNumber, birthDate, gender
contractType, baseSalary, pensionSystem, pensionProvider
bankName, bankAccountNumber
payrollCompanyId → FecCompany (empresa asignada para planilla)
shiftId → WorkShift
fecRoleAssignments, fecCompanyAccess (relaciones FEC)
```

**Regla**: Si `position` es "Gerente General" o "Country Manager", el supervisor es el mismo empleado.

---

## API Endpoints para Power Automate

Todos autenticados via header `x-webhook-secret`.

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/reportes/mensual?month=YYYY-MM` | Reporte mensual por supervisor |
| `GET /api/alertas/vencidas` | Vacaciones con >12 meses sin tomar |
| `POST /api/empleados/supervisores` | Sync masiva de supervisores desde O365 |

---

## Deployment — AWS Amplify

- **Local**: SQLite (`file:./dev.db`)
- **Producción**: PostgreSQL (AWS RDS)
- `amplify.yml` hace swap `sqlite → postgresql` en build + `prisma db push` + seed

### Variables de entorno en Amplify
| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL |
| `WEBHOOK_SIGNING_SECRET` | Secret para Power Automate |
| `NEXT_PUBLIC_APP_URL` | URL pública |
| `APP_TIMEZONE` | `America/Lima` |

---

## Restricciones Absolutas

### Reglas de Negocio
- **30 días de anticipación** para solicitudes de vacaciones
- **Consumo FIFO obligatorio** — siempre del periodo más antiguo
- **15 días máximo** de cash-out por periodo de devengamiento
- **Aprobación secuencial** — Supervisor → RRHH → Gerente General
- **50 palabras mínimas** en justificaciones de retorno anticipado
- **Interfaz en español** — todo texto visible en es-PE
- **Reglas de Vacaciones no cambian** — la lógica de negocio de vacaciones es estable

### Reglas Técnicas
- **NUNCA** almacenar credenciales en código fuente
- **NUNCA** commitear `.env` o `dev.db`
- **SIEMPRE** validar saldo antes de aprobar
- No usar `any` en TypeScript
- `Set` iteration: siempre usar `Array.from(new Set(...))` (tsconfig target es5)
- OneDrive causa EPERM/EINVAL en `.next` cache — hacer `rm -rf .next` antes de builds limpios
- Prisma DLL locked por dev server — `taskkill //F //IM node.exe` antes de `prisma generate`

---

## Módulo Recupero

Control de gestiones de campo para recuperación de equipos de telecomunicaciones (Claro, DirecTV, Mi Fibra) en Perú.

### Arquitectura

```
Páginas:
  /recupero                    — Dashboard: KPIs, gráfico efectividad, mapa Leaflet, tabla paginada
  /recupero/importar           — Carga manual (.xlsx/.txt), purga, eliminación individual, historial
  /recupero/reportes           — Reportes: Efectividad, Quemadas, Agentes, Fuera de Perú, Sin Coords
  /recupero/reportes/agente    — Reporte individual por agente (one-pager con PDF/print export)

API Routes:
  GET  /api/recupero                — Tareas paginadas con filtros
  GET  /api/recupero/stats          — KPIs agregados
  GET  /api/recupero/filters        — Valores únicos para dropdowns
  GET  /api/recupero/chart          — Datos diarios para gráfico Efectividad Diaria (stacked bars + effectiveness lines)
  GET  /api/recupero/chart-hourly   — Datos para gráfico Distribución Horaria
  GET  /api/recupero/reportes       — Reportes (effectiveness, burned, agents, outside-peru, missing-coords)
  GET  /api/recupero/agent-report   — Datos para reporte individual de agente
  POST /api/recupero/importar       — Carga con progress tracking, deduplicación por externalId
  GET  /api/recupero/importar       — Historial de importaciones / polling de progreso
  DEL  /api/recupero/importar/[id]  — Eliminar importación individual (admin)
  POST /api/recupero/purge          — Purgar todos los datos (admin)
  POST /api/recupero/webhook        — Import via webhook (n8n / SharePoint)

Librerías:
  lib/recupero/types.ts   — isSuccessful(), isAgendado(), interfaces
  lib/recupero/geo.ts     — determineCoordStatus(), isBurned(), haversineDistance(), isInsidePeru()
  lib/recupero/parser.ts  — parseFile() (auto-detección de delimitador: tab, ¬, ~, |, ;, ,), parseDate()

Componentes:
  components/recupero/RecuperoMap.tsx — Mapa Leaflet con pins estilo Google Maps (4 capas)
```

### Modelos Prisma

- **RecuperoImport** — registro de cada carga (fileName, source, totalRows, importedRows, errorRows)
- **RecuperoTask** — nivel de visita. Rows agrupadas por contrato + agente_campo + fecha_cierre
- **RecuperoEquipo** — nivel de equipo. Cada equipo recuperado vinculado a un RecuperoTask

### Agrupación de Visitas

Las filas del archivo fuente se agrupan en visitas por la combinación de `contrato + agente_campo + fecha_cierre`. Una visita (RecuperoTask) puede tener múltiples equipos (RecuperoEquipo).

### Modelo RecuperoEquipo (campos clave)

| Campo | Descripción |
|-------|-------------|
| serial | Serial del equipo |
| serial_adicional | Serial adicional (si aplica) |
| tarjetas | Cantidad de tarjetas |
| controles | Cantidad de controles remotos |
| fuentes | Cantidad de fuentes de poder |
| cables (poder, fibra, hdmi, rca, rj11, rj45) | Accesorios por tipo |
| gestion_exitosa | Si la gestión de este equipo fue exitosa |

### KPIs

| KPI | Descripción |
|-----|-------------|
| Total Gestiones | Total de visitas |
| Exitosas | Visitas con tipoCierre = "RECUPERADO WODEN" |
| No Exitosas | Visitas con otro tipoCierre |
| Quemadas | No exitosas + distancia haversine > 500m del punto de visita |
| Factor de Uso | Equipos recuperados / visitas exitosas |
| Equipos Recuperados | Total de equipos con gestion_exitosa |
| Sin Coords | Visitas sin coordenadas de cierre |
| Fuera de Perú | Visitas con coordenadas fuera del bounding box de Perú |

### Lógica de Negocio

| Concepto | Regla |
|----------|-------|
| Exitosa | `tipoCierre === "RECUPERADO WODEN"` |
| No Exitosa | Cualquier otro `tipoCierre` |
| Quemada | No exitosa + haversine distance > 500m del punto de visita |
| Agendado | `tarea` NO empieza con "VISITA" |
| No Agendado | `tarea` empieza con "VISITA" |
| Dentro de Perú | lat -18.35 a -0.04, lon -81.33 a -68.65 |
| Coords extraídas | Regex busca "(COORDENADAS: lat, lon)" en campo dirección |

### Pins del Mapa (4 capas toggleables — Leaflet)

| Capa | Color | Coords usadas |
|------|-------|---------------|
| Agendadas | Amarillo | latitud/longitud (del cliente) — TODOS los registros |
| Exitosas | Verde | latitudCierre/longitudCierre (donde cerró el agente) |
| No Exitosas | Rojo | latitudCierre/longitudCierre |
| Quemadas | Negro | latitudCierre/longitudCierre |

### Reportes

| Reporte | Descripción |
|---------|-------------|
| Efectividad | Tabla con columnas de equipos (tarjetas, controles, fuentes, cables) |
| Quemadas | Visitas quemadas con distancia al destino |
| Agentes | Resumen por agente de campo |
| Fuera de Perú | Visitas con coords fuera del bounding box |
| Sin Coordenadas | Visitas sin coords de cierre |
| Agente (one-pager) | Reporte individual por agente con PDF/print export |

### Gráficos

| Gráfico | Descripción |
|---------|-------------|
| Efectividad Diaria | Barras apiladas (exitosas/no exitosas) + líneas de efectividad. Toggle diario/mensual |
| Distribución Horaria | Distribución de gestiones por hora del día con data labels |

### Formato del Archivo de Importación

- Formatos soportados: `.xlsx` y `.txt`
- Auto-detección de delimitador para TXT: tab, `¬`, `~`, `|`, `;`, `,`
- 19 columnas: id, contrato, grupo, documento_id, agente_campo, cedula_usuario, nombre_usuario, direccion, ciudad, departamento, latitud, longitud, tarea, fecha_cierre, estado, latitud_cierre, longitud_cierre, tipo_cierre, tipo_base
- Coordenadas con "NaN" = no disponibles
- Algunas coords vienen embebidas en campo dirección como "(COORDENADAS: lat, lon)"

### Filtros Disponibles

Año, Mes, Día, Agente, Grupo, Tipo Base, Departamento, Coordenadas, Resultado (tipoCierre), Agendamiento

### Deduplicación

Al importar, se verifica por `externalId`. Para visitas agrupadas (múltiples filas por contrato + agente + fecha_cierre), se usa el ID de la primera fila del grupo como externalId. Registros con externalId ya existente se omiten.

### Permisos

Acceso al módulo Recupero restringido a: `ADMINISTRADOR`, `GERENTE_PAIS`, `RRHH`, `OFICIAL_SEGURIDAD`.
