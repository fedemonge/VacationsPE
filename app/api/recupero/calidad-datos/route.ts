import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { parseClientFile } from '@/lib/recupero/client-data-parser'
import { ensureRecuperoTables } from '@/lib/recupero/ensure-tables'

// GET - list all imports with quality stats
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureRecuperoTables()

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') // CLARO | DIRECTV | null (all)
  const year = searchParams.get('year')
  const month = searchParams.get('month')

  const where: Record<string, unknown> = {}
  if (source) where.source = source
  if (year) {
    const y = parseInt(year)
    const m = month ? parseInt(month) : null
    const start = new Date(y, m ? m - 1 : 0, 1)
    const end = m ? new Date(y, m, 1) : new Date(y + 1, 0, 1)
    where.receptionDate = { gte: start, lt: end }
  }

  const imports = await prisma.clientDataImport.findMany({
    where,
    orderBy: { receptionDate: 'desc' },
    select: {
      id: true,
      source: true,
      fileName: true,
      receptionDate: true,
      uploadDate: true,
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
      importedByEmail: true,
    },
  })

  return NextResponse.json(imports)
}

// POST - upload and import a file
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureRecuperoTables()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const receptionDateStr = formData.get('receptionDate') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { source, records } = parseClientFile(buffer, file.name)

    if (records.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 })
    }

    const receptionDate = receptionDateStr ? new Date(receptionDateStr) : new Date()

    // Calculate quality stats
    const validPhoneRows = records.filter(r => r.phoneStatus === 'VALID').length
    const incompletePhoneRows = records.filter(r => r.phoneStatus === 'INCOMPLETE').length
    const invalidPhoneRows = records.filter(r => r.phoneStatus === 'INVALID').length
    const missingPhoneRows = records.filter(r => r.phoneStatus === 'MISSING').length
    const validCoordsRows = records.filter(r => r.hasValidCoords).length
    const coordsInPeruRows = records.filter(r => r.coordsInPeru).length
    const coordsOutsidePeruRows = records.filter(r => r.coordsOutsidePeru).length
    const validAddressRows = records.filter(r => r.hasValidAddress).length
    const extractedCoordsRows = records.filter(r => r.coordsExtracted).length

    // Create import header first, then insert records in batches to avoid huge transactions
    const importResult = await prisma.clientDataImport.create({
      data: {
        source,
        fileName: file.name,
        receptionDate,
        totalRows: records.length,
        validPhoneRows,
        incompletePhoneRows,
        invalidPhoneRows,
        missingPhoneRows,
        validCoordsRows,
        coordsInPeruRows,
        coordsOutsidePeruRows,
        validAddressRows,
        extractedCoordsRows,
        importedByEmail: session.email,
      },
    })

    // Insert records in batches of 500 to avoid Prisma/DB statement size limits
    const BATCH_SIZE = 500
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      await prisma.clientDataRecord.createMany({
        data: batch.map(r => ({
          importId: importResult.id,
          rowNumber: r.rowNumber,
          externalId: r.externalId,
          customerId: r.customerId,
          customerName: r.customerName,
          address: r.address,
          district: r.district,
          province: r.province,
          department: r.department,
          workOrderType: r.workOrderType,
          status: r.status,
          phone1: r.phone1,
          phone2: r.phone2,
          latitude: r.latitude,
          longitude: r.longitude,
          coordsSource: r.coordsSource,
          equipmentType: r.equipmentType,
          equipmentModel: r.equipmentModel,
          serialNumber: r.serialNumber,
          technology: r.technology,
          hasValidPhone: r.hasValidPhone,
          phoneStatus: r.phoneStatus,
          hasValidCoords: r.hasValidCoords,
          coordsInPeru: r.coordsInPeru,
          coordsOutsidePeru: r.coordsOutsidePeru,
          hasValidAddress: r.hasValidAddress,
          coordsExtracted: r.coordsExtracted,
          rawData: r.rawData,
        })),
      })
    }

    return NextResponse.json({
      id: importResult.id,
      source,
      fileName: file.name,
      totalRows: records.length,
      validPhoneRows,
      incompletePhoneRows,
      invalidPhoneRows,
      missingPhoneRows,
      validCoordsRows,
      coordsInPeruRows,
      coordsOutsidePeruRows,
      validAddressRows,
      extractedCoordsRows,
    })
  } catch (error) {
    console.error('[calidad-datos POST]', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
