import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyInvoiceHTML } from '@/app/actions/monthly-invoice-pdf';
import {
  requireSession,
  getTenantFilterForMongo,
} from '@/lib/ownership';
import { resolveMonthlyInvoiceFromId } from '@/app/api/invoice/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();

    const tenantFilter =
      getTenantFilterForMongo(session);

    const id =
      request.nextUrl.searchParams.get('id') || '';

    const warehouseId =
      request.nextUrl.searchParams.get(
        'warehouseId'
      ) || undefined;

    const invoiceMode =
      request.nextUrl.searchParams.get('mode') ||
      undefined;

    const monthlyInvoice =
      await resolveMonthlyInvoiceFromId(
        id,
        warehouseId,
        tenantFilter,
        invoiceMode === 'transactions'
          ? 'transactions'
          : undefined
      );

    if (!monthlyInvoice) {
      return new NextResponse(
        'Invoice not found',
        {
          status: 404,
        }
      );
    }

    const html =
      await generateMonthlyInvoiceHTML(
        monthlyInvoice
      );

    console.log('Invoice HTML generation details', {
      invoiceId: id,
      warehouseId,
      invoiceNumber: monthlyInvoice.invoiceNumber,
      additionalCharges: monthlyInvoice.additionalCharges,
      additionalChargeItemsCount:
        monthlyInvoice.additionalChargeItems?.length ?? 0,
    });
    // Debug counts for transactions vs periods to troubleshoot old-format rendering
    try {
      console.log('[invoice/html] payload rows', {
        invoiceId: id,
        transactionsCount: Array.isArray(monthlyInvoice.transactions)
          ? monthlyInvoice.transactions.length
          : 0,
        periodsCount: Array.isArray(monthlyInvoice.periods)
          ? monthlyInvoice.periods.length
          : 0,
        sampleTransaction: monthlyInvoice.transactions?.slice?.(0, 2) || [],
      });
    } catch (e) {
      console.error('[invoice/html] payload debug failed', e);
    }

    const printableHtml = html.replace(
      '<body>',
      `<body>
        <div
          style="
            padding:12px;
            background:#f8fafc;
            color:#0f172a;
            font-size:13px;
            text-align:center;
          "
        >
          Press Ctrl+P (or ⌘+P on Mac)
          to print or save this invoice.
        </div>`
    );

    return new NextResponse(printableHtml, {
      status: 200,
      headers: {
        'Content-Type':
          'text/html; charset=utf-8',
        'Cache-Control':
          'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to render invoice';

    console.error(
      'Invoice HTML error:',
      error
    );

    return new NextResponse(message, {
      status: 500,
    });
  }
}