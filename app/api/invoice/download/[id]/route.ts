import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyInvoiceHTML } from '@/app/actions/monthly-invoice-pdf';
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

    const html = await generateMonthlyInvoiceHTML(monthlyInvoice);
    const printableHtml = html.replace(
      '<body>',
      `<body><div style="padding:12px;background:#f8fafc;color:#0f172a;font-size:13px;text-align:center;">Press Ctrl+P (or ⌘+P on Mac) to print or save this invoice.</div>`
    );

    return new NextResponse(printableHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to render invoice';
    console.error('Invoice download error:', error);
    return new NextResponse(message, { status: 500 });
  }
}
