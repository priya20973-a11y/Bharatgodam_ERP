import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/actions/client-actions';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: 'No file provided' }],
        error: 'No file provided',
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (e) {
      throw new Error('Could not parse file. Please ensure it is a valid Excel or CSV file.');
    }

    if (workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in the uploaded file');
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Parse as Array of Arrays to normalize headers
    const aoa: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (aoa.length < 2) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: 'File must contain header and at least one data row' }],
        error: 'File must contain header and at least one data row',
      }, { status: 400 });
    }

    const rawHeaders = aoa[0].map((h: any) => String(h).replace(/^["']|["']$/g, '').trim().toLowerCase().replace(/[\s_]+/g, ''));
    
    const requiredHeaders = ['name', 'address', 'clienttype', 'mobile'];
    const missingHeaders = requiredHeaders.filter((h) => !rawHeaders.includes(h));
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: `Missing required columns: ${missingHeaders.join(', ')}` }],
        error: `Missing required columns: ${missingHeaders.join(', ')}`,
      }, { status: 400 });
    }

    // Map rows using normalized headers
    const rows = [];
    for (let i = 1; i < aoa.length; i++) {
      const rowValues = aoa[i];
      // Skip completely empty rows
      if (rowValues.length === 0 || rowValues.every((v) => String(v).trim() === '')) {
         continue;
      }
      
      const rowObj: any = {};
      rawHeaders.forEach((header, index) => {
        rowObj[header] = rowValues[index] !== undefined ? String(rowValues[index]).trim() : '';
      });
      rows.push(rowObj);
    }

    const errors: Array<{ row: number; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      try {
        if (!row.name) throw new Error('Name is required');
        if (!row.address) throw new Error('Address is required');
        
        const clientType = (row.clienttype || 'FARMER').toUpperCase();
        if (!['FARMER', 'FPO', 'COMPANY', 'PURCHASE'].includes(clientType)) {
          throw new Error('ClientType must be FARMER, FPO, COMPANY, or PURCHASE');
        }

        const dataToCreate = {
          name: row.name,
          address: row.address,
          clientType: clientType as 'FARMER' | 'FPO' | 'COMPANY' | 'PURCHASE',
          mobile: row.mobile || 'NA',
          panNumber: row.pannumber || 'NA',
          aadharNumber: row.aadharnumber || 'NA',
          gstNumber: row.gstnumber || 'NA',
          state: row.state || 'Maharashtra', // Default if missing
          email: row.email,
        };

        const result = await createClient(dataToCreate, false);

        if (!result.success) {
          throw new Error(result.error || 'Failed to create client');
        }

        successCount += 1;
      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message || 'Unknown validation error' });
      }
    }

    return NextResponse.json({
      success: successCount > 0 && errors.length === 0,
      totalRows: rows.length,
      successCount,
      errorCount: errors.length,
      errors,
      warnings: [],
    });
  } catch (error: any) {
    console.error('[Client Bulk Upload] Failed:', error);
    return NextResponse.json({
      success: false,
      totalRows: 0,
      successCount: 0,
      errorCount: 1,
      errors: [{ row: 0, error: error.message || 'Failed to process client bulk upload' }],
      error: error.message || 'Failed to process client bulk upload',
    }, { status: 500 });
  }
}
