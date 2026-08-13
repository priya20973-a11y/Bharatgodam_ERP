import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWeight(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toString() + ' MT';
}

export function getDropdownDisplayName(
  item: { name?: string; label?: string; wspName?: string },
  allItems: { name?: string; label?: string }[],
  isAdmin: boolean
): string {
  const name = item?.name || item?.label || '';
  if (!isAdmin || !name) return name;
  const isDuplicate = allItems.filter(
    i => i && (i.name || i.label)?.trim().toUpperCase() === name.trim().toUpperCase()
  ).length > 1;

  if (isDuplicate && item.wspName) {
    return `${name} [${item.wspName}]`;
  }
  return name;
}

export function getDynamicUnitLabel(unit: string, type: 'count' | 'alloc' | 'weight' | 'storage' | 'singular' | 'plural' | 'large' | 'small' | 'mixed' | 'total'): string {
  const u = (unit || 'Bags').toLowerCase();
  let singular = 'Unit';
  let plural = 'Units';

  if (u === 'bag' || u === 'bags' || u === 'kg' || u === 'kgs') {
    singular = 'Bag';
    plural = 'Bags';
  } else if (u === 'box' || u === 'boxes') {
    singular = 'Box';
    plural = 'Boxes';
  } else if (u === 'barrel' || u === 'barrels') {
    singular = 'Barrel';
    plural = 'Barrels';
  } else if (u === 'drum' || u === 'drums') {
    singular = 'Drum';
    plural = 'Drums';
  } else if (u === 'crate' || u === 'crates') {
    singular = 'Crate';
    plural = 'Crates';
  } else if (u === 'nos' || u === 'no') {
    singular = 'Item';
    plural = 'Nos';
  } else {
    singular = unit;
    plural = unit + 's';
  }

  switch (type) {
    case 'count':
      return u === 'nos' || u === 'no' ? 'Quantity (Nos)' : `No. of ${plural}`;
    case 'alloc':
      return u === 'nos' || u === 'no' ? 'Alloc. Qty (Nos)' : `Alloc. ${plural}`;
    case 'weight':
      return `(KG)`;
    case 'storage':
      return `Storage Units (${plural})`;
    case 'singular':
      return singular;
    case 'plural':
      return plural;
    case 'large':
      return `Large ${singular}`;
    case 'small':
      return `Small ${singular}`;
    case 'mixed':
      return `Mixed ${singular}`;
    case 'total':
      return `Total ${plural}`;
    default:
      return `${plural}`;
  }
}
