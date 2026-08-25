import { formatChamberName, formatFloorName } from '@/lib/utils/cold-naming';
export interface ParsedStackQr {
  warehouseId: string | null;
  chamber: string;
  floor: string;
  stack: string;
}

export interface InwardStackLocation {
  key: string;
  chamberName: string;
  chamberNo?: number | string;
  floorNo: number | string;
  stackNo: number | string;
  allocatedWeight?: number;
  bagsCount?: number;
  displayName: string;
  stackLabel: string;
}

export function parseStackQrString(scannedText: string): ParsedStackQr | null {
  if (!scannedText || typeof scannedText !== 'string') return null;
  const trimmed = scannedText.trim();
  let warehouseId: string | null = null;
  let chamber: string | null = null;
  let floor: string | null = null;
  let stack: string | null = null;

  try {
    // 1. URL format (/cold/stack/{warehouseId}/{chamberName}/{floorNo}/{stackNo})
    if (trimmed.includes('/cold/stack/')) {
      const parts = trimmed.split('/cold/stack/')[1]?.split('?')[0]?.split('/');
      if (parts && parts.length >= 4) {
        warehouseId = decodeURIComponent(parts[0]);
        chamber = decodeURIComponent(parts[1]);
        floor = decodeURIComponent(parts[2]);
        stack = decodeURIComponent(parts[3]);
      }
    }
    // 2. JSON format
    else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const json = JSON.parse(trimmed);
      warehouseId = (json.warehouseId || json.wId || json.warehouse || '').toString();
      chamber = (json.chamberName || json.chamberNo || json.chamber || '').toString();
      floor = (json.floorName || json.floorNo || json.floor || '').toString();
      stack = (json.stackName || json.stackNo || json.stack || '').toString();
    }
    // 3. Delimited format (e.g. W1/C1/F1/S5 or C1/F1/S5)
    else {
      const parts = trimmed.split(/[\/|]/);
      if (parts.length >= 4) {
        warehouseId = parts[0].trim();
        chamber = parts[1].trim();
        floor = parts[2].trim();
        stack = parts[3].trim();
      } else if (parts.length === 3) {
        chamber = parts[0].trim();
        floor = parts[1].trim();
        stack = parts[2].trim();
      }
    }
  } catch (e) {
    console.error('Error parsing Stack QR:', e);
  }

  if (!chamber || !floor || !stack) {
    return null;
  }

  return { warehouseId, chamber, floor, stack };
}

const cleanVal = (val: any) => {
  if (val === undefined || val === null) return '';
  return String(val).toLowerCase().replace(/^(chamber|floor|stack|c|f|s)\s*/i, '').trim();
};

export function getUniqueInwardStacks(inwardItem: any): InwardStackLocation[] {
  if (!inwardItem) return [];
  const inward = inwardItem.inward || inwardItem;
  const allocations = inward.availableAllocations || inward.stackAllocations || [inward];

  const map = new Map<string, InwardStackLocation>();

  allocations.forEach((alloc: any) => {
    const cName = alloc.chamberName || alloc.chamberNo || 'Chamber';
    const fNo = alloc.floorNo !== undefined ? alloc.floorNo : (alloc.floorName || 1);
    const sNo = alloc.stackNo !== undefined ? alloc.stackNo : (alloc.stackName || 1);

    const cClean = cleanVal(cName);
    const fClean = cleanVal(fNo);
    const sClean = cleanVal(sNo);

    const key = `${cClean}_${fClean}_${sClean}`;

    if (!map.has(key)) {
      const displayChamber = (typeof cName === 'string' && cName.toLowerCase().startsWith('chamber')) ? cName : formatChamberName(null, cName);
      const displayFloor = (typeof fNo === 'string' && fNo.toLowerCase().startsWith('floor')) ? fNo : formatFloorName(null, fNo);
      const displayStack = (typeof sNo === 'string' && sNo.toLowerCase().startsWith('stack')) ? sNo : `Stack ${sNo}`;

      map.set(key, {
        key,
        chamberName: String(cName),
        chamberNo: alloc.chamberNo,
        floorNo: fNo,
        stackNo: sNo,
        allocatedWeight: alloc.availableQty !== undefined ? alloc.availableQty : alloc.allocatedWeight,
        bagsCount: alloc.bagsCount,
        displayName: `${displayChamber} / ${displayFloor} / ${displayStack}`,
        stackLabel: `${displayStack}`
      });
    }
  });

  return Array.from(map.values());
}

export function isSingleStackAllocMatch(scanned: ParsedStackQr, targetStack: InwardStackLocation, inwardWarehouse: any): boolean {
  if (!scanned || !targetStack) return false;

  // Verify Warehouse if specified in scanned QR
  if (scanned.warehouseId && inwardWarehouse) {
    const wId = inwardWarehouse._id ? inwardWarehouse._id.toString() : inwardWarehouse.toString();
    const wName = inwardWarehouse.name ? inwardWarehouse.name.toLowerCase() : '';
    const wCode = inwardWarehouse.warehouseId ? inwardWarehouse.warehouseId.toLowerCase() : '';
    const sW = scanned.warehouseId.toLowerCase();

    const matchesWarehouse = (wId === scanned.warehouseId || wName === sW || wCode === sW);
    if (!matchesWarehouse) return false;
  }

  const sChamber = cleanVal(scanned.chamber);
  const sFloor = cleanVal(scanned.floor);
  const sStack = cleanVal(scanned.stack);

  const tChamber = cleanVal(targetStack.chamberName || targetStack.chamberNo);
  const tFloor = cleanVal(targetStack.floorNo);
  const tStack = cleanVal(targetStack.stackNo);

  const chamberMatch = (sChamber === tChamber || String(targetStack.chamberName).toLowerCase() === String(scanned.chamber).toLowerCase());
  const floorMatch = (sFloor === tFloor || String(targetStack.floorNo).toLowerCase() === String(scanned.floor).toLowerCase());
  const stackMatch = (sStack === tStack || String(targetStack.stackNo).toLowerCase() === String(scanned.stack).toLowerCase());

  return chamberMatch && floorMatch && stackMatch;
}

export function verifyStackMatch(
  scanned: ParsedStackQr,
  inwardItem: any
): { isMatch: boolean; message: string; matchedStackKey?: string } {
  if (!scanned || !inwardItem) {
    return { isMatch: false, message: 'Invalid QR or inward stock details.' };
  }

  const inward = inwardItem.inward || inwardItem;
  const uniqueStacks = getUniqueInwardStacks(inward);

  for (const stackLocation of uniqueStacks) {
    if (isSingleStackAllocMatch(scanned, stackLocation, inward.warehouseId)) {
      return { 
        isMatch: true, 
        message: `Stock verified successfully for ${stackLocation.displayName}`,
        matchedStackKey: stackLocation.key
      };
    }
  }

  const expectedList = uniqueStacks.map(s => s.displayName).join(', ');
  return { 
    isMatch: false, 
    message: `Stack does not match this inward stock. Expected: ${expectedList || 'matching stack'}` 
  };
}
