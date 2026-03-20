/**
 * Parser for Claro and DirecTV client data files.
 * Extracts, normalizes and validates: phone numbers, coordinates, addresses.
 */

import * as XLSX from 'xlsx'

// ---- Types ----

export interface ParsedClientRecord {
  rowNumber: number
  externalId: string | null
  customerId: string | null
  customerName: string | null
  address: string | null
  district: string | null
  province: string | null
  department: string | null
  workOrderType: string | null
  status: string | null
  phone1: string | null
  phone2: string | null
  latitude: number | null
  longitude: number | null
  coordsSource: 'DIRECT' | 'EXTRACTED_ADDRESS' | 'EXTRACTED_OTHER' | 'MISSING'
  equipmentType: string | null
  equipmentModel: string | null
  serialNumber: string | null
  technology: string | null
  hasValidPhone: boolean
  phoneStatus: PhoneStatus // VALID | INCOMPLETE | INVALID | MISSING
  hasValidCoords: boolean
  coordsInPeru: boolean
  coordsOutsidePeru: boolean
  hasValidAddress: boolean
  coordsExtracted: boolean
  rawData: string
}

export type ClientSource = 'CLARO' | 'DIRECTV'

// ---- Coordinate extraction ----

const COORD_REGEX = /(-?\d{1,3}\.\d{3,15})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,15})/

function isValidPeruCoord(lat: number, lon: number): boolean {
  return lat >= -18.5 && lat <= 0.1 && lon >= -81.5 && lon <= -68.5
}

function extractCoordsFromText(text: string): { lat: number; lon: number } | null {
  if (!text) return null
  const match = text.match(COORD_REGEX)
  if (!match) return null
  const a = parseFloat(match[1])
  const b = parseFloat(match[2])
  // Peru coords: lat is negative (~-1 to -18), lon is negative (~-69 to -81)
  if (isValidPeruCoord(a, b)) return { lat: a, lon: b }
  if (isValidPeruCoord(b, a)) return { lat: b, lon: a }
  return null
}

// ---- Phone validation ----

export type PhoneStatus = 'VALID' | 'INCOMPLETE' | 'INVALID' | 'MISSING'

function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 0) return null
  return digits
}

function validatePeruPhone(raw: string | null | undefined): PhoneStatus {
  if (!raw) return 'MISSING'
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 0) return 'MISSING'
  // Valid mobile: 9XXXXXXXX (9 digits starting with 9)
  if (d.length === 9 && d.startsWith('9')) return 'VALID'
  // Valid mobile with country code: 519XXXXXXXX
  if (d.length === 11 && d.startsWith('519')) return 'VALID'
  // Valid landline: 7-8 digits (area code + number)
  if (d.length >= 7 && d.length <= 8) return 'VALID'
  // 9 digits not starting with 9 (area code + 7-digit landline)
  if (d.length === 9 && !d.startsWith('9')) return 'VALID'
  // Too few digits = incomplete
  if (d.length >= 1 && d.length < 7) return 'INCOMPLETE'
  // Too many digits or wrong format
  return 'INVALID'
}

// ---- Column name normalization ----

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function findCol(row: Record<string, unknown>, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const norm = normalizeKey(c)
    for (const key of Object.keys(row)) {
      if (normalizeKey(key) === norm) {
        const v = row[key]
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
      }
    }
  }
  return null
}

function findColFloat(row: Record<string, unknown>, ...candidates: string[]): number | null {
  const v = findCol(row, ...candidates)
  if (!v) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

// ---- Claro parser ----

function parseClaroRow(row: Record<string, unknown>, idx: number): ParsedClientRecord {
  const address = findCol(row, 'direccion') || ''
  const referencia = findCol(row, 'referencia') || ''
  const observacion = findCol(row, 'observacion', 'observacionsot') || ''

  // Extract coords from address (Claro embeds coords in direccion field)
  let latitude: number | null = null
  let longitude: number | null = null
  let coordsSource: ParsedClientRecord['coordsSource'] = 'MISSING'
  let coordsExtracted = false

  const addrCoords = extractCoordsFromText(address)
  if (addrCoords) {
    latitude = addrCoords.lat
    longitude = addrCoords.lon
    coordsSource = 'EXTRACTED_ADDRESS'
    coordsExtracted = true
  }

  // Also check referencia and observacion for coords
  if (!latitude) {
    const refCoords = extractCoordsFromText(referencia) || extractCoordsFromText(observacion)
    if (refCoords) {
      latitude = refCoords.lat
      longitude = refCoords.lon
      coordsSource = 'EXTRACTED_OTHER'
      coordsExtracted = true
    }
  }

  // Extract phone from referencia (e.g., "NUMERO DE WSSP 948061138")
  const phoneMatch = referencia.match(/(\d{9,12})/) || observacion.match(/(\d{9,12})/)
  const phone1 = cleanPhone(phoneMatch ? phoneMatch[1] : null)

  const district = findCol(row, 'distrito', 'nomdst')
  const province = findCol(row, 'nomprov')
  const department = findCol(row, 'nomdepa')

  const hasValidAddress = !!(address && address.length > 5 && (district || province))

  return {
    rowNumber: idx + 1,
    externalId: findCol(row, 'idagenda'),
    customerId: findCol(row, 'codcli', 'customer_id'),
    customerName: findCol(row, 'nomcli'),
    address,
    district,
    province,
    department,
    workOrderType: findCol(row, 'tipotrabajo', 'tipo'),
    status: findCol(row, 'estado'),
    phone1,
    phone2: null,
    latitude,
    longitude,
    coordsSource,
    equipmentType: findCol(row, 'equ_sot', 'prod_pri'),
    equipmentModel: findCol(row, 'workflow'),
    serialNumber: null,
    technology: findCol(row, 'tecnologia'),
    hasValidPhone: validatePeruPhone(phone1) === 'VALID',
    phoneStatus: validatePeruPhone(phone1),
    hasValidCoords: !!(latitude && longitude),
    coordsInPeru: !!(latitude && longitude && isValidPeruCoord(latitude, longitude)),
    coordsOutsidePeru: !!(latitude && longitude && !isValidPeruCoord(latitude, longitude)),
    hasValidAddress,
    coordsExtracted,
    rawData: JSON.stringify(row),
  }
}

// ---- DirecTV parser ----

function parseDirectvRow(row: Record<string, unknown>, idx: number): ParsedClientRecord {
  let latitude = findColFloat(row, 'y')
  let longitude = findColFloat(row, 'x')
  let coordsSource: ParsedClientRecord['coordsSource'] = 'MISSING'
  let coordsExtracted = false

  if (latitude && longitude) {
    coordsSource = 'DIRECT'
  }

  // Also check address fields for embedded coords
  if (!latitude || !longitude) {
    const address = findCol(row, 'direccionins', 'direccion_ins') || ''
    const extra = findCol(row, 'extrains', 'extra_ins') || ''
    const observ = findCol(row, 'observacion') || ''
    const found = extractCoordsFromText(address) || extractCoordsFromText(extra) || extractCoordsFromText(observ)
    if (found) {
      latitude = found.lat
      longitude = found.lon
      coordsSource = 'EXTRACTED_OTHER'
      coordsExtracted = true
    }
  }

  const phone1 = cleanPhone(findCol(row, 'telefonoparticularins', 'telefono_particular_ins'))
  const phone2 = cleanPhone(findCol(row, 'telefonolaboralins', 'telefono_laboral_ins'))

  const address = findCol(row, 'direccionins', 'direccion_ins') || ''
  const district = findCol(row, 'localidadins', 'localidad_ins')
  const province = findCol(row, 'provinciains', 'provincia_ins')
  const department = findCol(row, 'ciudadins', 'ciudad_ins')

  const ps1 = validatePeruPhone(phone1)
  const ps2 = validatePeruPhone(phone2)
  // Best phone status: VALID > INCOMPLETE > INVALID > MISSING
  const phoneStatusOrder: PhoneStatus[] = ['VALID', 'INCOMPLETE', 'INVALID', 'MISSING']
  const phoneStatus: PhoneStatus = phoneStatusOrder.find(s => s === ps1 || s === ps2) || 'MISSING'
  const hasValidPhone = phoneStatus === 'VALID'
  const hasValidAddress = !!(address && address.length > 5 && (district || province))

  return {
    rowNumber: idx + 1,
    externalId: findCol(row, 'nrowo', 'nro_wo'),
    customerId: findCol(row, 'nrocliente', 'nro_cliente'),
    customerName: findCol(row, 'apellidonombre', 'apellido_nombre'),
    address,
    district,
    province,
    department,
    workOrderType: findCol(row, 'wotype', 'wo_type'),
    status: findCol(row, 'estadowo', 'estado_wo'),
    phone1,
    phone2,
    latitude,
    longitude,
    coordsSource,
    equipmentType: findCol(row, 'ird_modem', 'ird/modem', 'clasificacion'),
    equipmentModel: findCol(row, 'modelo'),
    serialNumber: findCol(row, 'nro__serie', 'nro_serie'),
    technology: findCol(row, 'fodescription'),
    hasValidPhone,
    phoneStatus,
    hasValidCoords: !!(latitude && longitude),
    coordsInPeru: !!(latitude && longitude && isValidPeruCoord(latitude, longitude)),
    coordsOutsidePeru: !!(latitude && longitude && !isValidPeruCoord(latitude, longitude)),
    hasValidAddress,
    coordsExtracted,
    rawData: JSON.stringify(row),
  }
}

// ---- Main parser ----

export function detectSource(rows: Record<string, unknown>[]): ClientSource {
  if (!rows.length) return 'CLARO'
  const keys = Object.keys(rows[0]).map(normalizeKey)
  // DirecTV has NroCliente, NroWO, WOType
  if (keys.some(k => k.includes('nrocliente') || k.includes('nrowo') || k.includes('wotype'))) {
    return 'DIRECTV'
  }
  // Claro has idagenda, codcli, codsolot
  return 'CLARO'
}

export function parseClientFile(buffer: Buffer, fileName: string): {
  source: ClientSource
  records: ParsedClientRecord[]
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })

  if (!rows.length) return { source: 'CLARO', records: [] }

  const source = detectSource(rows)
  const parser = source === 'CLARO' ? parseClaroRow : parseDirectvRow
  const records = rows.map((row, idx) => parser(row, idx))

  return { source, records }
}
