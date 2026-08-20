import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ColdInvoice from '@/lib/models/ColdInvoice';
import '@/lib/models/Client';
import '@/lib/models/ColdWarehouse';
import { generateColdInvoiceHTML } from '@/lib/invoice/cold-invoice-pdf';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return new NextResponse('Invoice ID parameter missing', { status: 400 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    
    // Find invoice by _id or invoiceId
    const invoiceDoc = await ColdInvoice.findOne({
      $or: [{ _id: id }, { invoiceId: id }],
      ...tenantFilter
    })
      .populate('clientId')
      .populate('warehouseId')
      .lean();

    if (!invoiceDoc) {
      return new NextResponse('Cold storage invoice not found', { status: 404 });
    }

    const invoice: any = invoiceDoc;
    const client = invoice.clientId;
    const warehouse = invoice.warehouseId;

    const userDetails = {
      companyName: (session.user as any).companyName || warehouse?.name || '',
      companyLogo: warehouse?.warehouseLogo || '',
      phoneNumber: session.user.phoneNumber || '',
      address: warehouse?.address || '',
      coldLanguage: (session.user as any).coldLanguage || 'en',
    };

    const html = generateColdInvoiceHTML(
      invoice,
      client,
      warehouse,
      userDetails,
      userDetails.coldLanguage
    );

    const printableHtml = html.replace(
      '<body>',
      `<body>
        <div class="hide-on-print" style="background: #0f172a; color: #fff; text-align: center; padding: 10px; font-family: sans-serif; font-size: 13px; font-weight: 600;">
          <span>Cold Storage Invoice Preview — Press <strong>Ctrl+P</strong> (or ⌘+P) or click </span>
          <button onclick="window.print()" style="background: #3b82f6; color: #fff; border: none; padding: 4px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-left: 8px;">Print Invoice</button>
        </div>`
    );

    return new NextResponse(printableHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error generating cold invoice HTML:', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
