import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// GET /api/recupero/calidad-datos/trends?granularity=month|day&source=CLARO|DIRECTV
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const granularity = searchParams.get('granularity') || 'month' // month | day
  const source = searchParams.get('source') || null

  const where: Record<string, unknown> = {}
  if (source) where.source = source

  const imports = await prisma.clientDataImport.findMany({
    where,
    orderBy: { receptionDate: 'asc' },
    select: {
      source: true,
      receptionDate: true,
      totalRows: true,
      validPhoneRows: true,
      incompletePhoneRows: true,
      invalidPhoneRows: true,
      missingPhoneRows: true,
      validCoordsRows: true,
      coordsInPeruRows: true,
      coordsOutsidePeruRows: true,
      validAddressRows: true,
      extractedCoordsRows: true,
    },
  })

  // Group by period
  const grouped: Record<string, {
    period: string
    source: string
    totalRows: number
    validPhoneRows: number
    incompletePhoneRows: number
    invalidPhoneRows: number
    missingPhoneRows: number
    validCoordsRows: number
    coordsInPeruRows: number
    coordsOutsidePeruRows: number
    validAddressRows: number
    extractedCoordsRows: number
    importCount: number
  }> = {}

  for (const imp of imports) {
    const d = new Date(imp.receptionDate)
    const period = granularity === 'day'
      ? d.toISOString().split('T')[0]
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const key = `${period}__${imp.source}`

    if (!grouped[key]) {
      grouped[key] = {
        period,
        source: imp.source,
        totalRows: 0,
        validPhoneRows: 0,
        incompletePhoneRows: 0,
        invalidPhoneRows: 0,
        missingPhoneRows: 0,
        validCoordsRows: 0,
        coordsInPeruRows: 0,
        coordsOutsidePeruRows: 0,
        validAddressRows: 0,
        extractedCoordsRows: 0,
        importCount: 0,
      }
    }
    const g = grouped[key]
    g.totalRows += imp.totalRows
    g.validPhoneRows += imp.validPhoneRows
    g.incompletePhoneRows += imp.incompletePhoneRows
    g.invalidPhoneRows += imp.invalidPhoneRows
    g.missingPhoneRows += imp.missingPhoneRows
    g.validCoordsRows += imp.validCoordsRows
    g.coordsInPeruRows += imp.coordsInPeruRows
    g.coordsOutsidePeruRows += imp.coordsOutsidePeruRows
    g.validAddressRows += imp.validAddressRows
    g.extractedCoordsRows += imp.extractedCoordsRows
    g.importCount += 1
  }

  // Convert to array with percentages
  const trends = Object.values(grouped)
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(g => ({
      ...g,
      pctValidPhone: g.totalRows ? +(g.validPhoneRows / g.totalRows * 100).toFixed(1) : 0,
      pctIncompletePhone: g.totalRows ? +(g.incompletePhoneRows / g.totalRows * 100).toFixed(1) : 0,
      pctInvalidPhone: g.totalRows ? +(g.invalidPhoneRows / g.totalRows * 100).toFixed(1) : 0,
      pctMissingPhone: g.totalRows ? +(g.missingPhoneRows / g.totalRows * 100).toFixed(1) : 0,
      pctValidCoords: g.totalRows ? +(g.validCoordsRows / g.totalRows * 100).toFixed(1) : 0,
      pctCoordsInPeru: g.totalRows ? +(g.coordsInPeruRows / g.totalRows * 100).toFixed(1) : 0,
      pctCoordsOutsidePeru: g.totalRows ? +(g.coordsOutsidePeruRows / g.totalRows * 100).toFixed(1) : 0,
      pctValidAddress: g.totalRows ? +(g.validAddressRows / g.totalRows * 100).toFixed(1) : 0,
    }))

  return NextResponse.json(trends)
}
