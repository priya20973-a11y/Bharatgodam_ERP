/**
 * Utilities for formatting Chamber and Floor names consistently across the system.
 * Removes the legacy 'Chamber X' and 'Floor Y' prefixes if custom names are disabled.
 */

export function formatChamberName(name: string | undefined | null, chamberNo?: number | string): string {
  if (name && name.trim().toLowerCase() !== `chamber ${chamberNo}`) {
    return name;
  }
  return `Chamber ${chamberNo || '-'}`;
}

export function formatFloorName(name: string | undefined | null, floorNo?: number | string): string {
  if (name && name.trim().toLowerCase() !== `floor ${floorNo}`) {
    return name;
  }
  return `Floor ${floorNo || '-'}`;
}

export function formatChamberDisplay(name: string | number | undefined | null, chamberNo?: number | string): string {
  if (name === undefined || name === null) return `C${chamberNo || '-'}`;
  const lowerName = String(name).trim().toLowerCase();
  
  const chamberMatch = lowerName.match(/^(?:cchamber|chamber)\s+(\d+)$/);
  if (chamberMatch) {
    return `C${chamberMatch[1]}`;
  }
  
  return String(name);
}

export function formatFloorDisplay(name: string | number | undefined | null, floorNo?: number | string): string {
  if (name === undefined || name === null || String(name).trim() === '') {
    return `F${floorNo || '-'}`;
  }
  const lowerName = String(name).trim().toLowerCase();
  
  const floorMatch = lowerName.match(/^floor\s+(\d+)$/);
  if (floorMatch) {
    return `F${floorMatch[1]}`;
  }
  
  if (lowerName === String(floorNo).trim().toLowerCase()) {
    return `F${floorNo}`;
  }
  
  return String(name).trim();
}
