import { NextResponse } from 'next/server';
import { getClientRevenueAnalytics } from '@/app/actions/transaction-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get('warehouseId') || undefined;
    const month = url.searchParams.get('month') || undefined;
    const analytics = await getClientRevenueAnalytics(warehouseId, month);
    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      }
    });
  } catch (error) {
    console.error('Error fetching revenue dashboard analytics:', error);
    return NextResponse.json(
      { summary: { totalRevenue: 0, ownerEarnings: 0, platformCommissions: 0 }, warehouseRevenue: [] },
      { status: 500 }
    );
  }
}
