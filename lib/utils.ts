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
    return `${name} (${item.wspName})`;
  }
  return name;
}
