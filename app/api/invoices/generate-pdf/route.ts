/**
 * Invoice PDF Generation API Route
 * POST /api/invoices/generate-pdf
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const invoiceId = body.invoiceId || body.id || 'unknown';

  console.warn('PDF generation request received but PDF endpoint is disabled for this deployment.', {
    invoiceId,
  });

  return NextResponse.json(
    {
      success: false,
      error:
        'PDF generation is disabled on this deployment. Use the HTML invoice preview route instead: /api/invoice/html?id=<invoiceId>',
      invoiceId,
    },
    { status: 501 }
  );
}
