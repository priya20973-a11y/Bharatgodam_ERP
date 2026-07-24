import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import '@/lib/models/Client';
import '@/lib/models/ColdCommodity';
import '@/lib/models/ColdWarehouse';

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '0';
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function GET(request: NextRequest) {
  try {
    const inwardId = request.nextUrl.searchParams.get('inwardId');
    const downloadOnly = request.nextUrl.searchParams.get('download') === '1';
    if (!inwardId) {
      return new NextResponse('Missing inwardId', { status: 400 });
    }

    await connectToDatabase();

    const inward = await ColdInward.findById(inwardId)
      .populate('clientId', 'name')
      .populate('commodityId', 'name type')
      .populate('warehouseId', 'name')
      .lean();

    if (!inward) {
      return new NextResponse('Inward record not found', { status: 404 });
    }

    const baseOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const qrTarget = `${baseOrigin}/api/cold/qr?inwardId=${encodeURIComponent(inwardId)}`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget);

    const stackDetails = (inward?.stackAllocations || []).map((alloc: any) => ({
      chamberNo: alloc.chamberNo,
      floorNo: alloc.floorNo,
      stackNo: alloc.stackNo,
    }));

    if (downloadOnly) {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cold Storage QR</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
    .page { max-width: 520px; margin: 40px auto; padding: 24px; background: #fff; border-radius: 16px; box-shadow: 0 12px 35px rgba(15, 23, 42, 0.08); text-align: center; }
    .qr-box { display: inline-block; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background: white; }
    img { width: 280px; height: 280px; display: block; }
    .meta { margin-top: 16px; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
    .meta-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 14px; }
    .label { color: #64748b; font-weight: 700; }
    .value { font-weight: 700; }
    .actions { margin-top: 18px; }
    .btn { display: inline-block; padding: 10px 16px; border-radius: 10px; background: #2563eb; color: white; text-decoration: none; font-weight: 700; }
    @media print {
      .actions { display: none !important; }
      body { background: white; }
      .page { box-shadow: none; margin: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="meta">
      <div class="meta-row"><span class="label">Warehouse</span><span class="value">${(inward.warehouseId as any)?.name || 'Unknown'}</span></div>
      ${stackDetails.length > 0 ? stackDetails.map((stack: any) => `
        <div class="meta-row"><span class="label">Chamber / Floor / Stack</span><span class="value">${formatNumber(stack.chamberNo)} / ${formatNumber(stack.floorNo)} / ${formatNumber(stack.stackNo)}</span></div>
      `).join('') : `<div class="meta-row"><span class="label">Chamber / Floor / Stack</span><span class="value">-</span></div>`}
    </div>
    <div class="qr-box">
      <img src="${qrDataUrl}" alt="Cold Storage QR Code" />
    </div>
    <div class="actions">
      <a class="btn" href="javascript:window.print()">Print QR Only</a>
    </div>
  </div>
</body>
</html>`;

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      });
    }

    const outwards = await ColdOutward.find({ inwardId })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const totalInward = inward.stackAllocations?.reduce((sum: number, alloc: any) => sum + Number(alloc.allocatedWeight || 0), 0) || 0;
    const totalOutward = outwards.reduce((sum: number, outward: any) => sum + Number(outward.quantityKg || 0), 0);
    const remaining = Math.max(0, totalInward - totalOutward);

    const scaleRows = (inward.stackAllocations || []).map((alloc: any) => {
      const matched = outwards.filter((o: any) =>
        Number(o.chamberNo) === Number(alloc.chamberNo) &&
        Number(o.floorNo) === Number(alloc.floorNo) &&
        Number(o.stackNo) === Number(alloc.stackNo)
      );
      const outwardQty = matched.reduce((sum: number, o: any) => sum + Number(o.quantityKg || 0), 0);
      return {
        chamberNo: alloc.chamberNo,
        floorNo: alloc.floorNo,
        stackNo: alloc.stackNo,
        inwardQty: Number(alloc.allocatedWeight || 0),
        outwardQty,
        remainingQty: Math.max(0, Number(alloc.allocatedWeight || 0) - outwardQty),
      };
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cold Storage QR Status</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .page { max-width: 880px; margin: 24px auto; padding: 24px; background: #fff; border-radius: 16px; box-shadow: 0 12px 35px rgba(15, 23, 42, 0.08); }
    .header { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 18px; }
    .title { font-size: 24px; font-weight: 700; }
    .sub { color: #64748b; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
    .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
    .value { margin-top: 4px; font-size: 20px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 14px; }
    th { background: #f8fafc; }
    .pill { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 700; }
    .danger { background: #fee2e2; color: #b91c1c; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="title">Cold Storage Inward Stock Status</div>
        <div class="sub">This QR stays the same for the inward record. Scan it later to see the latest outward consumption and remaining stock.</div>
      </div>
      <div class="pill">Inward ID: ${inwardId}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Client</div><div class="value">${(inward.clientId as any)?.name || 'Unknown'}</div></div>
      <div class="card"><div class="label">Commodity</div><div class="value">${(inward.commodityId as any)?.name || 'Unknown'} ${(inward.commodityId as any)?.type ? `(${(inward.commodityId as any).type})` : ''}</div></div>
      <div class="card"><div class="label">Warehouse</div><div class="value">${(inward.warehouseId as any)?.name || 'Unknown'}</div></div>
      <div class="card"><div class="label">Inward Date</div><div class="value">${formatDate(inward.date)}</div></div>
      <div class="card"><div class="label">Total Inward</div><div class="value">${formatNumber(totalInward)} Kg</div></div>
      <div class="card"><div class="label">Total Outward</div><div class="value">${formatNumber(totalOutward)} Kg</div></div>
      <div class="card"><div class="label">Remaining Stock</div><div class="value">${formatNumber(remaining)} Kg</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${remaining > 0 ? 'Active' : 'Completed'}</div></div>
    </div>

    <h3>Stack-wise remaining quantity</h3>
    <table>
      <thead>
        <tr>
          <th>Chamber</th>
          <th>Floor</th>
          <th>Stack</th>
          <th>Inward Qty</th>
          <th>Outward Qty</th>
          <th>Remaining</th>
        </tr>
      </thead>
      <tbody>
        ${scaleRows.map((row: any) => `
          <tr>
            <td>${row.chamberNo}</td>
            <td>${row.floorNo}</td>
            <td>${row.stackNo}</td>
            <td>${formatNumber(row.inwardQty)} Kg</td>
            <td>${formatNumber(row.outwardQty)} Kg</td>
            <td>${formatNumber(row.remainingQty)} Kg</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3 style="margin-top: 20px;">Outward transactions linked to this inward</h3>
    ${outwards.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Qty</th>
            <th>Chamber / Floor / Stack</th>
            <th>Slip No</th>
          </tr>
        </thead>
        <tbody>
          ${outwards.map((outward: any) => `
            <tr>
              <td>${formatDate(outward.date)}</td>
              <td>${formatNumber(outward.quantityKg)} Kg</td>
              <td>${Number(outward.chamberNo)} / ${Number(outward.floorNo)} / ${Number(outward.stackNo)}</td>
              <td>${outward.weighbridgeSlipNo || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No outward transactions linked yet.</p>'}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error generating QR stock status:', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
