import { generateInvoiceHTML } from '@/lib/invoice/html-generator';
import { InvoiceData } from '@/lib/invoice/types';
import { format } from 'date-fns';

/**
 * Convert ColdInvoice + related entities into the standard InvoiceData
 * and reuse the main invoice HTML generator so cold invoices match dry format.
 * Only include line items that have outward activity (outwardKg > 0 or outwardDate present).
 */
export function generateColdInvoiceHTML(
  invoice: any,
  client: any,
  warehouse: any,
  userDetails?: { companyLogo?: string; phoneNumber?: string; companyName?: string; address?: string },
  lang: string = 'en'
) {
  const invoiceNo = invoice.invoiceId || invoice.invoiceNo || (invoice._id ? String(invoice._id).slice(-6).toUpperCase() : 'CINV-000');
  const invoiceDate = invoice.generatedAt ? format(new Date(invoice.generatedAt), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy');

  // Build line items from invoice.items but include only those with outward activity
  const lineItems = (invoice.items || []).filter((it: any) => {
    return (it.outwardKg && Number(it.outwardKg) > 0) || it.outwardDate;
  }).map((it: any) => {
    return {
      whCode: warehouse?.code || warehouse?._id || '',
      billFrom: warehouse?.name || userDetails?.companyName || '',
      itemName: it.commodityName || it.commodity || 'Commodity',
      corNo: it.corNo || '',
      billTo: client?.name || '',
      quantity: Number((it.outwardKg || it.quantityKg || 0) / 1000), // convert kg to MT for the dry invoice template
      weight: Number((it.outwardKg || it.quantityKg || 0) / 1000),
      month: it.month || '',
      days: it.days || 0,
      ratePerUnit: it.ratePerUnit || it.rate || 0,
      storageChargesPerMonth: it.storageChargesPerMonth || 0,
      amount: Number(it.subtotal || it.amount || 0),
    };
  });

  const basicTotal = lineItems.reduce((s: number, li: any) => s + (li.amount || 0), 0);
  const roundOff = Math.round(basicTotal) - basicTotal;
  const netAmount = Math.round(basicTotal);

  // Compute total outward kg for storage summary (show in kgs as requested)
  const totalOutwardKg = (invoice.items || []).reduce((s: number, it: any) => s + (Number(it.outwardKg || it.quantityKg || 0)), 0);
  const storageFrom = invoice.fromDate ? format(new Date(invoice.fromDate), 'dd/MM/yyyy') : '';
  const storageTo = invoice.toDate ? format(new Date(invoice.toDate), 'dd/MM/yyyy') : '';
  const storageSummary = `Storage charge for inventory (${storageFrom} to ${storageTo}): ${totalOutwardKg} kgs`;

  const invoiceData: InvoiceData = {
    company: {
      name: warehouse?.name || userDetails?.companyName || 'Cold Warehouse',
      address: warehouse?.address || userDetails?.address || '',
      logo: userDetails?.companyLogo || warehouse?.logo || '',
      email: userDetails?.companyLogo ? '' : '',
      website: '',
      phone: userDetails?.phoneNumber || '',
      gstin: warehouse?.gstin || ''
    },
    customer: {
      name: client?.name || 'Client',
      area: client?.area || '',
      city: client?.city || '',
      district: client?.district || '',
      state: client?.state || '',
      contact: client?.mobile || client?.phone || ''
    },
    metadata: {
      invoiceId: invoice.invoiceId,
      invoiceNo,
      invoiceDate,
      gstin: warehouse?.gstin || '',
      storageSummary,
      warehouseName: warehouse?.name || userDetails?.companyName || ''
    },
    lineItems,
    financial: {
      basicTotal,
      roundOff,
      netAmount
    },
    bankDetails: {
      bankName: '',
      branchName: '',
      accountNumber: '',
      ifscCode: ''
    },
    termsAndConditions: [],
    authorizedBy: userDetails?.companyName || '',
    notes: storageSummary
  };

  return generateInvoiceHTML(invoiceData);
}
