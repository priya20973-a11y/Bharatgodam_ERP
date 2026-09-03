import { NextResponse } from 'next/server';
import { getClientRevenueAnalytics } from '@/app/actions/transaction-actions';

/**
 * GET /api/revenue-dashboard/ledger-periods
 * Fetch ledger-derived invoice periods for revenue sharing page detail table
 * Query params: warehouseId (optional), month (optional, YYYY-MM)
 * 
 * Returns ledger entries with accurate day-by-day outward deductions
 * for the CSV export.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get('warehouseId') || undefined;
    const month = url.searchParams.get('month') || undefined;

    // Call the robust simulation engine which now returns detailed ledgerPeriods
    const analytics = await getClientRevenueAnalytics(warehouseId, month);

    // Default to empty array if something fails
    const periods = analytics?.ledgerPeriods || [];
    periods.sort((a: any, b: any) => a.periodStart.localeCompare(b.periodStart));

    return NextResponse.json({
      success: true,
      count: periods.length,
      periods,
    });
  } catch (error) {
    console.error('Error fetching ledger periods via analytics engine:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch ledger periods', error: String(error) },
      { status: 500 }
    );
  }
}
