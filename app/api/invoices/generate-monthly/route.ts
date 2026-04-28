import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin, getTenantFilterForMongo } from '@/lib/ownership';
import { generateMonthlyInvoices } from '@/app/actions/stock-ledger-actions';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const body = await request.json();
    const invoiceMonth = String(body.invoiceMonth || '').trim();

    if (!invoiceMonth) {
      return NextResponse.json({ success: false, message: 'invoiceMonth is required' }, { status: 400 });
    }

    const result: { success: boolean; message: string } = await generateMonthlyInvoices(
      invoiceMonth,
      isAdmin(session) ? undefined : session.user.id,
      tenantFilter
    );
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error('POST /api/invoices/generate-monthly error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate invoices' },
      { status: 500 }
    );
  }
}
