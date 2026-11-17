import { NextRequest, NextResponse } from 'next/server';
import { getDryStorageReceiptData } from '@/app/actions/dry-storage-receipt-actions';
import { generateGatePassHTML } from '@/lib/invoice/gate-pass-html';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const type = (request.nextUrl.searchParams.get('type') as 'inward' | 'outward' | null) || undefined;

    if (!id) {
      return new NextResponse('Missing transaction ID parameter', { status: 400 });
    }

    const data = await getDryStorageReceiptData(id, type);
    const html = generateGatePassHTML(data);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Error generating Gate Pass:', error);
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}

