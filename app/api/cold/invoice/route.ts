import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilter } from '@/lib/ownership';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { en, gu } from '@/lib/i18n/cold/dictionaries';
import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse('Unauthorized', { status: 401 });

    const { hasPermission } = await import('@/lib/permissions');
    if (!hasPermission(session, 'invoice', 'view')) {
      return new NextResponse('Forbidden: Insufficient permissions', { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    if (!id || !type) return new NextResponse('Missing parameters', { status: 400 });

    await connectToDatabase();
    const db = await getDb();
    const tenantFilter = getTenantFilter(session);

    let transaction;
    if (type === 'INWARD') {
      transaction = await ColdInward.findOne({ _id: id, ...tenantFilter })
        .populate('clientId')
        .populate('commodityId')
        .populate('warehouseId');
    } else {
      transaction = await ColdOutward.findOne({ _id: id, ...tenantFilter })
        .populate('clientId')
        .populate('commodityId')
        .populate('warehouseId');
    }

    if (!transaction) return new NextResponse('Transaction not found', { status: 404 });

    const t: any = transaction;

    const dateStr = new Date(t.date).toLocaleDateString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const isStaff = (session.user as any).isStaff;
    const userId = isStaff ? (session.user as any).staffId : session.user.id;
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    const companyName = t.warehouseId?.name || (session.user as any).companyName || 'Cold Storage Co.';
    const companyAddress = t.warehouseId?.address || (session.user as any).companyAddress || 'Default Address';
    const mobile = session.user.phoneNumber || dbUser?.phoneNumber || '+91-0000000000';
    const logoUrl = t.warehouseId?.warehouseLogo || '';

    const refPersons = t.referencePersons && t.referencePersons.length > 0 
      ? t.referencePersons.map((rp: any) => rp.name).join(', ')
      : '-';

    const invoiceNo = t._id.toString().substring(t._id.toString().length - 6).toUpperCase();

    const lang = (session.user as any).coldLanguage === 'gu' ? gu : en;
    const isGu = (session.user as any).coldLanguage === 'gu';
    const l = lang.receipt as any;

    const formatNumber = (num: number | string | null | undefined) => {
      if (num === null || num === undefined) return '';
      const str = typeof num === 'number' ? num.toLocaleString('en-IN') : String(num);
      return isGu ? toGujaratiDigits(str) : str;
    };

    const html = `
      <!DOCTYPE html>
      <html lang="${(session.user as any).coldLanguage || 'en'}">
      <head>
        <meta charset="UTF-8">
        <title>${type} Receipt - ${invoiceNo}</title>
        <style>
          @page {
            size: A5 portrait;
            margin: 0;
          }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 10mm;
            background: #fff;
            color: #000;
            font-size: 12px;
            box-sizing: border-box;
            width: 148mm;
            height: 210mm;
          }
          .receipt-container {
            border: 2px solid #b91c1c;
            padding: 2px;
            height: 100%;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            background-color: #fff9f9;
            position: relative;
          }
          .inner-border {
            border: 1px solid #b91c1c;
            padding: 15px;
            height: 100%;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
          }
          .header {
            display: flex;
            align-items: center;
            border-bottom: 2px solid #b91c1c;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .logo-area {
            width: 100px;
            height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 20px;
          }
          .logo-area img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .company-info {
            flex: 1;
            text-align: center;
          }
          .company-name {
            font-size: 20px;
            font-weight: 900;
            color: #b91c1c;
            margin: 0 0 5px 0;
            text-transform: uppercase;
          }
          .company-address {
            font-size: 10px;
            margin: 0;
            color: #1f2937;
          }
          .receipt-title-wrapper {
            text-align: center;
            margin-top: -26px;
            margin-bottom: 15px;
          }
          .receipt-title {
            background: #b91c1c;
            color: #fff;
            padding: 4px 15px;
            border-radius: 12px;
            display: inline-block;
            font-weight: bold;
            font-size: 14px;
            border: 2px solid #fff;
          }
          .top-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            font-weight: bold;
            color: #b91c1c;
          }
          .field-row {
            display: flex;
            margin-bottom: 10px;
            align-items: flex-end;
          }
          .field-label {
            font-weight: bold;
            color: #b91c1c;
            margin-right: 5px;
            white-space: nowrap;
          }
          .field-value {
            flex: 1;
            border-bottom: 1px dashed #7f1d1d;
            padding-bottom: 2px;
            font-weight: 500;
            color: #111827;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          
          .main-details {
            display: flex;
            gap: 15px;
            margin-top: 15px;
          }
          
          .location-box {
            border: 1px solid #b91c1c;
            width: 150px;
          }
          .location-row {
            display: flex;
            border-bottom: 1px solid #b91c1c;
          }
          .location-row:last-child {
            border-bottom: none;
          }
          .loc-label {
            padding: 5px;
            color: #b91c1c;
            font-weight: bold;
            border-right: 1px solid #b91c1c;
            width: 70px;
          }
          .loc-val {
            padding: 5px;
            font-weight: bold;
            text-align: center;
            flex: 1;
          }
          
          .weight-box {
            border: 1px solid #b91c1c;
            flex: 1;
          }
          .weight-row {
            display: flex;
            border-bottom: 1px solid #b91c1c;
          }
          .weight-row:last-child {
            border-bottom: none;
          }
          .w-label {
            padding: 5px;
            color: #b91c1c;
            font-weight: bold;
            border-right: 1px solid #b91c1c;
            width: 100px;
          }
          .w-val {
            padding: 5px;
            font-weight: bold;
            text-align: right;
            flex: 1;
            padding-right: 15px;
          }
          
          .notes-box {
            margin-top: 15px;
            padding: 10px;
            border: 1px solid #b91c1c;
            font-size: 10px;
            line-height: 1.4;
            background: #fff;
          }
          
          .spacer {
            flex: 1;
          }
          
          .footer-sigs {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
          }
          .sig-line {
            width: 120px;
            border-top: 1px solid #000;
            text-align: center;
            padding-top: 5px;
            font-weight: bold;
            color: #b91c1c;
            font-size: 11px;
          }
          
          .print-btn-container {
            text-align: center;
            margin-top: 20px;
          }
          .print-btn {
            background: #b91c1c;
            color: #fff;
            border: none;
            padding: 8px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }
          
          @media print {
            .print-btn-container { display: none; }
            body { padding: 0; background: none; }
            .receipt-container { background-color: transparent; }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="inner-border">
            <div class="header">
              <div class="logo-area">
                ${logoUrl ? `<img src="${logoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Logo" />` : ``}
              </div>
              <div class="company-info">
                <h1 class="company-name">${companyName}</h1>
                <p class="company-address">${companyAddress}</p>
                <p class="company-address">Mobile: ${mobile}</p>
              </div>
            </div>
            
            <div class="receipt-title-wrapper">
              <span class="receipt-title">${l.receiptTitle.replace('{type}', type === 'INWARD' ? l.inward : l.outward)}</span>
            </div>
            
            <div class="top-meta">
              <div>${l.receiptNo} ${isGu ? toGujaratiDigits(invoiceNo) : invoiceNo}</div>
              <div>${l.date} ${isGu ? toGujaratiDigits(dateStr) : dateStr}</div>
            </div>
            
            <div class="field-row">
              <div class="field-label">${l.clientName}</div>
              <div class="field-value">${t.clientId?.name || 'N/A'}</div>
            </div>
            
            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">${l.refPerson}</div>
                <div class="field-value">${refPersons}</div>
              </div>
              <div class="field-row">
                <div class="field-label">${l.warehouse}</div>
                <div class="field-value">${t.warehouseId?.name || 'N/A'}</div>
              </div>
            </div>
            
            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">${l.commodity}</div>
                <div class="field-value">${t.commodityId?.name || '-'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">${l.variety}</div>
                <div class="field-value">${t.commodityId?.type || '-'}</div>
              </div>
            </div>
            
            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">${l.seed || 'Seed'}</div>
                <div class="field-value">${t.seed || '-'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">${l.tableLabel || 'Table/Label'}</div>
                <div class="field-value">${t.tableLabel || '-'}</div>
              </div>
            </div>
            
            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">${l.truckNo || 'Truck/Tractor No.'}</div>
                <div class="field-value">${t.truckNo || '-'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">${l.weighbridgeSlipNo || 'Weighbridge Slip No.'}</div>
                <div class="field-value">${t.weighbridgeSlipNo || '-'}</div>
              </div>
            </div>

            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">${l.marko || 'Marko'}</div>
                <div class="field-value">${t.marko || '-'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">${l.status}</div>
                <div class="field-value">${type === 'INWARD' ? l.inward : l.outward}</div>
              </div>
            </div>
            
            <div class="main-details">
              <div class="location-box">
                <div class="location-row">
                  <div class="loc-label">${l.chamber}</div>
                  <div class="loc-val">${formatNumber(t.chamberNo)}</div>
                </div>
                <div class="location-row">
                  <div class="loc-label">${l.floor}</div>
                  <div class="loc-val">${formatNumber(t.floorNo)}</div>
                </div>
                <div class="location-row">
                  <div class="loc-label">${l.stack}</div>
                  <div class="loc-val">${formatNumber(t.stackNo)}</div>
                </div>
              </div>
              
              <div class="location-box">
                <div class="location-row">
                  <div class="loc-label">${l.bagsCount || l.noOfBags}</div>
                  <div class="loc-val">${formatNumber(t.bagsCount)}</div>
                </div>
                <div class="location-row">
                  <div class="loc-label">${l.jin || 'Jin'}</div>
                  <div class="loc-val">${formatNumber(t.jin || 0)}</div>
                </div>
                <div class="location-row">
                  <div class="loc-label">${l.totalBags || 'Total Bags'}</div>
                  <div class="loc-val">${formatNumber(t.totalBags || t.bagsCount)}</div>
                </div>
              </div>
              
              <div class="weight-box">
                <div class="weight-row">
                  <div class="w-label">${l.quantityKg || l.grossQty}</div>
                  <div class="w-val">${formatNumber(t.grossWeight || t.quantityKg)}</div>
                </div>
                <div class="weight-row">
                  <div class="w-label">${l.emptyWeight || l.deduction}</div>
                  <div class="w-val">${formatNumber(t.emptyWeight || 0)}</div>
                </div>
                <div class="weight-row">
                  <div class="w-label">${l.netWeight || l.netQty}</div>
                  <div class="w-val">${formatNumber(t.quantityKg)}</div>
                </div>
                <div class="weight-row">
                  <div class="w-label">${l.kataBharati || 'Kata Bharati'}</div>
                  <div class="w-val">${formatNumber(t.kataBharati || 0)}</div>
                </div>
              </div>
            </div>
            
            <div class="notes-box">
              ${l.noteText}
            </div>
            
            <div class="spacer"></div>
            
            <div class="footer-sigs">
              <div class="sig-line">${l.customerSignature}</div>
              <div class="sig-line">${l.authorizedSignatory}</div>
            </div>
            
          </div>
        </div>
        
        <div class="print-btn-container">
          <button class="print-btn" onclick="window.print()">${l.printReceipt}</button>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Invoice error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
