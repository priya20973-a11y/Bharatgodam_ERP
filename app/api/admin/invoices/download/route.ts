import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function parseObjectId(value: string | null): ObjectId | null {
  if (!value) {
    return null;
  }

  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function wrapCsv(value: any) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function formatCsvRow(row: any[]) {
  return row.map(wrapCsv).join(',');
}

function formatDate(value: any) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const warehouseId = url.searchParams.get('warehouseId')?.trim() || '';
    const month = url.searchParams.get('month')?.trim() || '';

    if (!warehouseId || !month) {
      return NextResponse.json(
        { success: false, message: 'warehouseId and month are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const warehouseObjectId = parseObjectId(warehouseId);
    const query: any = {
      invoiceMonth: month,
    };

    if (warehouseObjectId) {
      query.warehouseId = warehouseObjectId;
    } else if (warehouseId) {
      query.warehouseId = ObjectId.isValid(warehouseId) ? new ObjectId(warehouseId) : warehouseId;
    }

    const invoices = await db.collection('invoice_master').find(query).sort({ clientId: 1 }).toArray();
    
    let warehouse: any = null;
    if (warehouseObjectId) {
      warehouse = await db.collection('warehouses').findOne({ _id: warehouseObjectId });
    } else if (warehouseId && ObjectId.isValid(warehouseId)) {
      warehouse = await db.collection('warehouses').findOne({ _id: new ObjectId(warehouseId) });
    }

    const clientIds = Array.from(new Set(invoices.map((invoice) => String(invoice.clientId)))).map((id) => parseObjectId(id)).filter(Boolean) as ObjectId[];
    const clients = clientIds.length
      ? await db.collection('clients').find({ _id: { $in: clientIds } }).toArray()
      : [];

    const clientNameMap = new Map(clients.map((client) => [String(client._id), client.name]));
    const header = [
      'Invoice ID',
      'Client Name',
      'Warehouse Name',
      'Invoice Month',
      'Status',
      'Total Amount',
      'Paid Amount',
      'Due Date',
      'Generated At',
      'Client ID',
      'Warehouse ID',
    ];

    const rows = invoices.map((invoice) => [
      invoice.invoiceId || String(invoice._id),
      clientNameMap.get(String(invoice.clientId)) || String(invoice.clientId),
      warehouse?.name || String(warehouseId),
      invoice.invoiceMonth || '',
      invoice.status || '',
      invoice.totalAmount ?? '',
      invoice.paidAmount ?? '',
      invoice.dueDate || '',
      formatDate(invoice.generatedAt || invoice.createdAt || invoice.updatedAt),
      String(invoice.clientId),
      String(invoice.warehouseId),
    ]);

    const csvData = '\uFEFF' + [header, ...rows].map(formatCsvRow).join('\r\n');
    const safeWarehouseName = warehouse?.name?.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_') || warehouseId;
    const filename = `invoices-${month}-${safeWarehouseName}.csv`;

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/admin/invoices/download error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to generate invoice download' },
      { status: 500 }
    );
  }
}
