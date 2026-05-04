import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyInvoicePDF } from '@/app/actions/monthly-invoice-pdf';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import { resolveMonthlyInvoiceFromId } from '@/app/api/invoice/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilterForMongo(session);

    const { id } = await params;
    const warehouseId = request.nextUrl.searchParams.get('warehouseId') || undefined;
    const monthlyInvoice = await resolveMonthlyInvoiceFromId(id, warehouseId, tenantFilter);

    if (!monthlyInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const pdfBuffer = await generateMonthlyInvoicePDF(monthlyInvoice);

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${monthlyInvoice.bookingId.replace(/\//g, '_')}.pdf"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate invoice';
    console.error('Invoice download error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
