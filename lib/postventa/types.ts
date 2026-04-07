export interface PostventaOrdenRow {
  preodsNumero: string | null;
  odsNumero: string | null;
  imei: string | null;
  segmento: string | null;
  marca: string | null;
  modelo: string | null;
  sucursal: string | null;
  ciudad: string | null;
  pais: string | null;
  preorden: Date | null;
  ingreso: Date | null;
  ingresoUsuario: string | null;
  envio: Date | null;
  envioUsuario: string | null;
  diagnostico: Date | null;
  diagnosticoUsuario: string | null;
  revision: Date | null;
  fechaPendiente: Date | null;
  fechaEscalado: Date | null;
  fechaCotizado: Date | null;
  fechaFinanciamiento: Date | null;
  fechaDevolucion: Date | null;
  entregaAlmacen: Date | null;
  fechaIrreparable: Date | null;
  reparacion: Date | null;
  estadoFinal: string | null;
  reparacionUsuario: string | null;
  calidad: Date | null;
  calidadUsuario: string | null;
  retorno: Date | null;
  retornoUsuario: string | null;
  entrega: Date | null;
  entregaUsuario: string | null;
  condicionIngreso: string | null;
  descCondicion: string | null;
  estadoOperativo: string | null;
  estadoOrden: string | null;
  ciudadHomologada: string | null;
  tipoDeZona: string | null;
  targetTatGarantias: number | null;
  tatGarantiasArchivo: number | null;
  cumplTatGarantia: string | null;
  targetTatLaboratorio: number | null;
  tatWodenArchivo: number | null;
  cumplTatWoden: string | null;
  tatLaboratorioArchivo: number | null;
  cumplTatLaboratorio: string | null;
  tiempoEsperaReparacion: number | null;
  desvioTatGarantias: number | null;
  linea: number | null;
  periodoIngreso: string | null;
  anoIng: number | null;
  mesIng: number | null;
  diaIngreso: number | null;
  periodoCierre: string | null;
  anoCierre: number | null;
  mesCierre: number | null;
  diaCierre: number | null;
  cierreOdsxEstado: string | null;
  gestionable: string | null;
  condicionCalculada: string | null;
  annoIngreso: number | null;
  mesIngreso: number | null;
  annoDiagnostico: number | null;
  mesDiagnostico: number | null;
  annoReparacion: number | null;
  mesReparacion: number | null;
  fechaActualizacion: Date | null;
}

export interface TatCalcOptions {
  includeSaturdays: boolean;
  includeSundays: boolean;
  includeHolidays: boolean;
  holidays: Date[];
}

export interface SubProcessTats {
  tatGarantiasCalc: number | null;
  tatWodenCalc: number | null;
  tatLaboratorioCalc: number | null;
  tatIngresoADiag: number | null;
  tatDiagAReparacion: number | null;
  tatReparacionACalidad: number | null;
  tatCalidadARetorno: number | null;
  tatRetornoAEntrega: number | null;
  cumplTatGarantiaCalc: boolean | null;
  cumplTatWodenCalc: boolean | null;
  cumplTatLabCalc: boolean | null;
}

export interface ImportProgress {
  processed: number;
  total: number;
  phase: string;
  done: boolean;
  result?: ImportResult;
}

export interface ImportResult {
  imported: number;
  updated: number;
  errors: number;
  totalRows: number;
}

export interface PostventaStats {
  totalOrdenes: number;
  abiertas: number;
  cerradas: number;
  gestionables: number;
  noGestionables: number;
  cumplimientoTatGarantia: number;
  cumplimientoTatWoden: number;
  cumplimientoTatLab: number;
  tatPromedioGarantia: number;
  tatPromedioWoden: number;
  tatPromedioLab: number;
  porEstadoOperativo: { estado: string; cantidad: number }[];
  porMarca: { marca: string; cantidad: number }[];
  porSegmento: { segmento: string; cantidad: number }[];
}

// Column mapping: file header → field name
export const COLUMN_MAP: Record<string, string> = {
  preods_numero: "preodsNumero",
  ods_numero: "odsNumero",
  imei: "imei",
  segmento: "segmento",
  marca: "marca",
  modelo: "modelo",
  sucursal: "sucursal",
  ciudad: "ciudad",
  preorden: "preorden",
  ingreso: "ingreso",
  ingreso_usuario: "ingresoUsuario",
  envio: "envio",
  envio_usuario: "envioUsuario",
  diagnostico: "diagnostico",
  revision: "revision",
  diagnostico_usuario: "diagnosticoUsuario",
  fecha_pendiente: "fechaPendiente",
  fecha_escalado: "fechaEscalado",
  fecha_cotizado: "fechaCotizado",
  fecha_financiamiento: "fechaFinanciamiento",
  fecha_devolucion: "fechaDevolucion",
  entrega_almacen: "entregaAlmacen",
  fecha_irreparable: "fechaIrreparable",
  reparacion: "reparacion",
  estado_final: "estadoFinal",
  reparacion_usuario: "reparacionUsuario",
  calidad: "calidad",
  calidad_usuario: "calidadUsuario",
  retorno: "retorno",
  retorno_usuario: "retornoUsuario",
  entrega: "entrega",
  entrega_usuario: "entregaUsuario",
  pais: "pais",
  condicion_ingreso: "condicionIngreso",
  Desc_condicion: "descCondicion",
  EstadoOperativo: "estadoOperativo",
  EstadoOrden: "estadoOrden",
  CiudadHomologada: "ciudadHomologada",
  TipodeZona: "tipoDeZona",
  Target_TAT_Garantias: "targetTatGarantias",
  TAT_Garantias: "tatGarantiasArchivo",
  Cumpl_TAT_Garantia: "cumplTatGarantia",
  Target_TAT_Laboratorio: "targetTatLaboratorio",
  TAT_Woden: "tatWodenArchivo",
  Cumpl_TAT_Woden: "cumplTatWoden",
  TAT_Laboratorio: "tatLaboratorioArchivo",
  Cumpl_TAT_Laboratorio: "cumplTatLaboratorio",
  Tiempo_Espera_Reparacion: "tiempoEsperaReparacion",
  linea: "linea",
  DesvioTATGarantias: "desvioTatGarantias",
  FechaIng: "fechaIng",
  PeriodoIngreso: "periodoIngreso",
  AnoIng: "anoIng",
  MesIng: "mesIng",
  DiaIngreso: "diaIngreso",
  FechaCierre: "fechaCierre",
  PeriodoCierre: "periodoCierre",
  AnoCierre: "anoCierre",
  MesCierre: "mesCierre",
  DiaCierre: "diaCierre",
  Cierre_ODSxEstado: "cierreOdsxEstado",
  Gestionable: "gestionable",
  Condicion_Calculada: "condicionCalculada",
  Anno_Ingreso: "annoIngreso",
  Mes_Ingreso: "mesIngreso",
  Anno_Diagnostico: "annoDiagnostico",
  Mes_Diagnostico: "mesDiagnostico",
  Anno_Reparacion: "annoReparacion",
  Mes_Reparacion: "mesReparacion",
  fecha_actualizacion: "fechaActualizacion",
};

// Date fields that need DateTime parsing
export const DATE_FIELDS = new Set([
  "preorden", "ingreso", "envio", "diagnostico", "revision",
  "fechaPendiente", "fechaEscalado", "fechaCotizado", "fechaFinanciamiento",
  "fechaDevolucion", "entregaAlmacen", "fechaIrreparable", "reparacion",
  "calidad", "retorno", "entrega", "fechaActualizacion",
]);

// Numeric fields
export const FLOAT_FIELDS = new Set([
  "targetTatGarantias", "tatGarantiasArchivo", "targetTatLaboratorio",
  "tatWodenArchivo", "tatLaboratorioArchivo", "tiempoEsperaReparacion",
  "desvioTatGarantias",
]);

export const INT_FIELDS = new Set([
  "linea", "anoIng", "mesIng", "diaIngreso",
  "anoCierre", "mesCierre", "diaCierre",
  "annoIngreso", "mesIngreso", "annoDiagnostico", "mesDiagnostico",
  "annoReparacion", "mesReparacion",
]);
