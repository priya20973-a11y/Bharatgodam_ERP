'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Centralized warehouse service - Single source of truth for all warehouse operations
 * All warehouse data must come from the 'warehouses' collection (warehouse master)
 */

export interface WarehouseMaster {
  _id: ObjectId;
  name: string;
  address: string;
  totalCapacity: number;
  occupiedCapacity: number;
  status: 'ACTIVE' | 'INACTIVE' | 'FULL';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all warehouses from warehouse master
 */
export async function getAllWarehouses(): Promise<WarehouseMaster[]> {
  const db = await getDb();
  const warehouses = await db.collection('warehouses')
    .find({})
    .sort({ name: 1 })
    .toArray();

  return warehouses as WarehouseMaster[];
}

/**
 * Get warehouse options for dropdowns
 */
export async function getWarehouseOptions() {
  const warehouses = await getAllWarehouses();
  return warehouses
    .filter(w => w.status === 'ACTIVE' || w.status === 'FULL') // Only include ACTIVE and FULL warehouses in dropdowns
    .map(w => ({
      label: w.name,
      value: w._id.toString()
    }));
}

/**
 * Get warehouse by ID
 */
export async function getWarehouseById(id: string): Promise<WarehouseMaster | null> {
  const db = await getDb();
  const warehouse = await db.collection('warehouses').findOne({
    _id: new ObjectId(id)
  });
  return warehouse as WarehouseMaster | null;
}

/**
 * Get warehouse name by ID (for display purposes)
 */
export async function getWarehouseNameById(id: string): Promise<string> {
  const warehouse = await getWarehouseById(id);
  return warehouse?.name || 'Unknown Warehouse';
}

/**
 * Validate if warehouse ID exists in master
 */
export async function isValidWarehouseId(warehouseId: string): Promise<boolean> {
  const warehouse = await getWarehouseById(warehouseId);
  return warehouse !== null;
}

/**
 * Get all valid warehouse IDs
 */
export async function getValidWarehouseIds(): Promise<string[]> {
  const warehouses = await getAllWarehouses();
  return warehouses.map(w => w._id.toString());
}

/**
 * Validate warehouse ID before creating any record
 * Should be called before creating transactions, invoices, etc.
 */
export async function validateWarehouseId(warehouseId: string): Promise<void> {
  const isValid = await isValidWarehouseId(warehouseId);
  if (!isValid) {
    throw new Error(`Invalid warehouse ID: ${warehouseId}. Warehouse must exist in warehouse master.`);
  }
}

/**
 * Get warehouse details for validation and display
 */
export async function getWarehouseForValidation(warehouseId: string): Promise<{ id: string; name: string; status: string }> {
  const warehouse = await getWarehouseById(warehouseId);
  if (!warehouse) {
    throw new Error(`Warehouse not found: ${warehouseId}`);
  }

  return {
    id: warehouse._id.toString(),
    name: warehouse.name,
    status: warehouse.status
  };
}

/**
 * Create warehouse lookup map for efficient lookups
 */
export async function createWarehouseLookupMap(): Promise<Map<string, WarehouseMaster>> {
  const warehouses = await getAllWarehouses();
  const map = new Map<string, WarehouseMaster>();
  warehouses.forEach(w => {
    map.set(w._id.toString(), w);
  });
  return map;
}