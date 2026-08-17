import connectToDatabase from '@/lib/mongoose';
import ColdInvoice from '@/lib/models/ColdInvoice';
import { requireSession, getTenantFilter } from '@/lib/ownership';

export async function GET(req: Request, { params }: { params: { clientId: string } }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const filter = getTenantFilter(session);
    const clientId = params.clientId;
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get('warehouseId');

    const query: any = {
      ...filter,
      clientId,
    };
    if (warehouseId) query.warehouseId = warehouseId;

    const invoices = await ColdInvoice.find(query)
      .populate('clientId', 'name')
      .populate('warehouseId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return new Response(JSON.stringify({ success: true, data: invoices }), { status: 200 });
  } catch (err: any) {
    console.error('Error fetching cold invoices:', err);
    return new Response(JSON.stringify({ success: false, message: err.message || 'Failed to fetch cold invoices' }), { status: 500 });
  }
}
