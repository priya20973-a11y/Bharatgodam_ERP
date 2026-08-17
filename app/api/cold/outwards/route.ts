import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import { requireSession, getTenantFilter } from '@/lib/ownership';

export async function GET(req: Request) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const filter = getTenantFilter(session);
    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId');
    const warehouseId = url.searchParams.get('warehouseId');

    const query: any = { ...filter };
    if (clientId) query.clientId = clientId;
    if (warehouseId) query.warehouseId = warehouseId;

    const outwards = await ColdOutward.find(query)
      .populate('commodityId', 'name')
      .populate('warehouseId', 'name')
      .populate('clientId', 'name')
      .sort({ date: -1 })
      .lean();

    return new Response(JSON.stringify({ success: true, data: outwards }), { status: 200 });
  } catch (err: any) {
    console.error('Error fetching cold outwards:', err);
    return new Response(JSON.stringify({ success: false, message: err.message || 'Failed to fetch outwards' }), { status: 500 });
  }
}
