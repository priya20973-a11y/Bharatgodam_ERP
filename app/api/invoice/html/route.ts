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

    const normalizedWarehouseId = (() => {
      if (!warehouseId || !id) return warehouseId;
      const parts = id.split('-');
      if (parts.length >= 4) {
        const idWarehouseSegment = parts.slice(3).join('-');
        if (idWarehouseSegment === warehouseId) {
          console.log(
            '[invoice/html] ignoring duplicate warehouseId param matching id segment',
            { id, warehouseId }
          );
          return undefined;
        }
      }
      return warehouseId;
    })();

    const debug = request.nextUrl.searchParams.get('debug') === 'true';

    const invoiceMode =
      request.nextUrl.searchParams.get('mode') ||
      undefined;

    const monthlyInvoice =
      await resolveMonthlyInvoiceFromId(
        id,
        normalizedWarehouseId,
        tenantFilter,
        invoiceMode === 'transactions'
          ? 'transactions'
          : undefined
      );

    if (debug) {
      // Provide a safe diagnostic JSON response for production debugging.
      try {
        const parsed = { parts: id ? id.split('-') : [] };
        const attemptWithWarehouse = await resolveMonthlyInvoiceFromId(
          id,
          warehouseId,
          tenantFilter,
          invoiceMode === 'transactions' ? 'transactions' : undefined
        );
        const attemptWithoutWarehouse = await resolveMonthlyInvoiceFromId(
          id,
          undefined,
          tenantFilter,
          invoiceMode === 'transactions' ? 'transactions' : undefined
        );

        const summarize = (inv: any) => {
          if (!inv) return { found: false };
          return {
            found: true,
            invoiceNumber: inv.invoiceNumber || inv.invoiceId || null,
            warehouseId: inv.warehouseId || inv.warehouseId === undefined ? inv.warehouseId : null,
            warehouseName: inv.warehouseName || null,
            periodsCount: Array.isArray(inv.periods) ? inv.periods.length : 0,
            transactionsCount: Array.isArray(inv.transactions) ? inv.transactions.length : 0,
          };
        };

        return NextResponse.json({
          id,
          warehouseId,
          parsed,
          attemptWithWarehouse: summarize(attemptWithWarehouse),
          attemptWithoutWarehouse: summarize(attemptWithoutWarehouse),
        });
      } catch (e) {
        console.error('[invoice/html] debug response failed', e);
        return new NextResponse('Debug failed', { status: 500 });
      }
    }

    if (!monthlyInvoice) {
      console.warn('[invoice/html] initial resolution returned null', { id, warehouseId, invoiceMode });

      // Fallback attempts: some clients include warehouse IDs in the invoice identifier
      // while others pass them as a query param. Try both forms and log the results.
      try {
        // Try resolving without warehouseId param (let resolver parse warehouse parts from `id`)
        console.log('[invoice/html] attempting fallback without warehouseId param', { id });
        const fallback2 = await resolveMonthlyInvoiceFromId(id, undefined, tenantFilter, invoiceMode === 'transactions' ? 'transactions' : undefined);
        if (fallback2) {
          console.log('[invoice/html] fallback (no warehouse param) succeeded', { id });
          const html = await generateMonthlyInvoiceHTML(fallback2);
          const printableHtml = html.replace(
            '<body>',
            `<body>
        <div class="print-banner hide-on-print">
          Press Ctrl+P (or ⌘+P on Mac) to print or save this invoice.
        </div>`
          );

          return new NextResponse(printableHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            },
          });
        }
      } catch (e) {
        console.error('[invoice/html] fallback resolution attempts failed', e);
      }

      return new NextResponse('Invoice not found', { status: 404 });
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
        <div class="print-banner hide-on-print">
          Press Ctrl+P (or ⌘+P on Mac) to print or save this invoice.
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