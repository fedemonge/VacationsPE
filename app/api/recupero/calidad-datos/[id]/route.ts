import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// GET - get import details with records
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const imp = await prisma.clientDataImport.findUnique({
    where: { id: params.id },
    include: {
      records: {
        orderBy: { rowNumber: 'asc' },
        select: {
          id: true,
          rowNumber: true,
          externalId: true,
          customerId: true,
          customerName: true,
          address: true,
          district: true,
          province: true,
          department: true,
          phone1: true,
          phone2: true,
          latitude: true,
          longitude: true,
          coordsSource: true,
          equipmentType: true,
          technology: true,
          hasValidPhone: true,
          phoneStatus: true,
          hasValidCoords: true,
          coordsInPeru: true,
          coordsOutsidePeru: true,
          hasValidAddress: true,
          coordsExtracted: true,
          status: true,
        },
      },
    },
  })

  if (!imp) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  return NextResponse.json(imp)
}

// DELETE - delete a specific import and its records
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.clientDataImport.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
