import { format } from 'date-fns';

/**
 * Maps standard keys to the transaction data.
 * @param transaction The populated transaction object
 * @param receiptType 'inward', 'outward', 'transfer', or 'invoice'
 */
export function mapTransactionToTemplate(transaction: any, receiptType: 'inward' | 'outward' | 'transfer' | 'invoice'): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    // Shared formatting
    const dateObj = new Date(transaction.date || transaction.createdAt || Date.now());
    result.date = format(dateObj, 'dd/MM/yyyy');
    result.time = format(dateObj, 'hh:mm a');
    result.receiptNo = transaction.receiptNo || transaction.receiptNumber || transaction.batchId || '';

    // Client
    if (transaction.clientId) {
      result.clientName = transaction.clientId.name || '';
      result.farmerName = transaction.clientId.name || '';
      result.farmerId = transaction.farmerId || transaction.clientId.clientNo || transaction.clientId._id || '';
      result.address = transaction.clientId.address || '';
      result.village = transaction.villageName || transaction.clientId.village || '';
      result.mobile = transaction.clientId.mobile || '';
    } else if (transaction.fromClientId && receiptType === 'transfer') {
      result.clientName = transaction.fromClientId.name || '';
      result.farmerName = transaction.fromClientId.name || '';
      result.farmerId = transaction.farmerId || transaction.fromClientId.clientNo || transaction.fromClientId._id || '';
      result.address = transaction.fromClientId.address || '';
      result.village = transaction.fromClientId.village || '';
      result.mobile = transaction.fromClientId.mobile || '';
    }

    // Commodity
    if (transaction.commodityId) {
      result.commodity = transaction.commodityId.name || '';
      result.variety = transaction.commodityId.type || '';
    }
    result.grade = transaction.grade || transaction.gradingType || '';
    
    // Quantities & Weights
    result.bags = (transaction.bagsCount || transaction.totalBags || 0).toString();
    result.largeBags = (transaction.largeBag || 0).toString();
    result.smallBags = (transaction.smallBag || 0).toString();
    
    result.grossWeight = (transaction.grossWeight || transaction.quantityKg || 0).toFixed(2);
    result.emptyWeight = (transaction.emptyWeight || 0).toFixed(2);
    const net = (transaction.quantityKg || ((transaction.grossWeight || 0) - (transaction.emptyWeight || 0)));
    result.netWeight = net ? net.toFixed(2) : '0.00';

    // Vehicles & Identifiers
    result.vehicleNo = transaction.truckNo || transaction.vehicleNo || '';
    result.slipNo = transaction.weighbridgeSlipNo || '';
    result.marko = transaction.marko || '';

    // Stacks
    if (transaction.stacksInfo && transaction.stacksInfo.length > 0) {
      // Inward with parsed stacksInfo
      const chambers = Array.from(new Set(transaction.stacksInfo.map((s: any) => s.chamberNo))).join(', ');
      const floors = Array.from(new Set(transaction.stacksInfo.map((s: any) => s.floorNo))).join(', ');
      const stacks = Array.from(new Set(transaction.stacksInfo.map((s: any) => s.stackNo))).join(', ');
      
      result.chamberNo = chambers;
      result.floorNo = floors;
      result.rackNo = stacks;

      const allocatedBagsList = transaction.stacksInfo.map((s: any) => `Stack ${s.stackNo}: ${s.bagsCount || s.allocatedBags || 0}`);
      result.allocatedBags = allocatedBagsList.join('<br/>');
    } else {
      // Outward or Transfer single fields
      result.chamberNo = transaction.chamberName || transaction.chamberNo || '';
      result.floorNo = transaction.floorName || transaction.floorNo || '';
      result.rackNo = transaction.stackName || transaction.stackNo || '';

      if (transaction.bagsCount || transaction.allocatedBags) {
        result.allocatedBags = `Stack ${transaction.stackName || transaction.stackNo || 1}: ${transaction.bagsCount || transaction.allocatedBags || 0}`;
      } else {
        result.allocatedBags = '';
      }
    }

    result.remarks = transaction.remarks || transaction.note || '';

    // Invoice Specific Fields
    if (receiptType === 'invoice') {
      const storageFrom = transaction.fromDate ? format(new Date(transaction.fromDate), 'dd/MM/yyyy') : '';
      const storageTo = transaction.toDate ? format(new Date(transaction.toDate), 'dd/MM/yyyy') : '';
      result.storagePeriod = (storageFrom && storageTo) ? `${storageFrom} to ${storageTo}` : (storageFrom || storageTo || 'N/A');
      
      const items = Array.isArray(transaction.items) ? transaction.items : [];
      const rentTotal = items.reduce((sum: number, item: any) => sum + (Number(item.subtotal || item.amount || 0)), 0);
      result.rentAmount = rentTotal.toFixed(2);
      
      const additionalCharges = Array.isArray(transaction.additionalCharges) ? transaction.additionalCharges : [];
      const additionalTotal = additionalCharges.reduce((sum: number, chg: any) => sum + (Number(chg.amount) || 0), 0);
      result.additionalCharges = additionalTotal.toFixed(2);
      
      const basicTotal = rentTotal + additionalTotal;
      result.basicTotal = basicTotal.toFixed(2);
      
      const taxGroup = transaction.taxGroup || '';
      const gstRateMatch = taxGroup.match(/\d+/);
      const gstRate = gstRateMatch ? Number(gstRateMatch[0]) : 0;
      
      let cgst = 0, sgst = 0, igst = 0;
      if (gstRate > 0) {
        // Simplified tax calculation for mapping (assumes tax is already computed or simple intra/inter state logic)
        // In reality, the PDF generator has complex logic for this. We will just approximate or use stored values if they exist
        const totalTaxAmount = (basicTotal * gstRate) / 100;
        const wState = transaction.warehouseId?.state?.toLowerCase().trim() || '';
        const bState = (transaction.billingState && transaction.billingState !== 'null_val')
          ? transaction.billingState.toLowerCase().trim()
          : (transaction.clientId?.state?.toLowerCase().trim() || '');
          
        const companyGst = transaction.warehouseId?.gstin || '';
        const customerGst = transaction.clientId?.gstin || '';
        
        let isInterState = false;
        if (wState && bState) {
          isInterState = wState !== bState;
        } else if (customerGst && customerGst !== 'NA' && companyGst && companyGst !== 'NA') {
          isInterState = customerGst.substring(0, 2) !== companyGst.substring(0, 2);
        }
        
        if (isInterState) {
          igst = totalTaxAmount;
        } else {
          cgst = totalTaxAmount / 2;
          sgst = totalTaxAmount / 2;
        }
      }
      
      result.cgstAmount = cgst > 0 ? cgst.toFixed(2) : '0.00';
      result.sgstAmount = sgst > 0 ? sgst.toFixed(2) : '0.00';
      result.igstAmount = igst > 0 ? igst.toFixed(2) : '0.00';
      
      const adjustment = Number(transaction.adjustment) || 0;
      result.adjustment = adjustment.toFixed(2);
      
      const netAmount = basicTotal + cgst + sgst + igst + adjustment;
      result.netAmount = netAmount.toFixed(2);
      
      result.companyGstin = transaction.warehouseId?.gstin || '';
      result.companyPan = transaction.warehouseId?.panNo || transaction.warehouseId?.pan || '';
      result.clientGstin = transaction.clientId?.gstin || '';
      result.clientPan = transaction.clientId?.pan || '';
      
      // Amount in words could be added here if we import the formatter
      // For now, leave it empty or add a simple mapping if needed
      result.netAmountWords = ''; // Require amountInWords from formatters if needed
    }
    
  } catch (error) {
    console.error('Error mapping transaction to template fields:', error);
  }

  return result;
}
