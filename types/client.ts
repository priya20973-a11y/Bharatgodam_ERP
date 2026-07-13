export interface Warehouse {
  id: string;
  name: string;
  address: string;
  totalCapacity: number;
  availableCapacity: number;
  isActive: boolean;
}

export interface Commodity {
  id: string;
  name: string;
  rate: number;
  rateUnit: 'day' | 'month';
  hsnCode?: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  type: 'Farmer' | 'FPO' | 'Company';
  mobile: string;
  commodityIds?: string[];
  otherDetails?: string;
}

export interface Transaction {
  id: string;
  type: 'Inward' | 'Outward';
  clientId: string;
  warehouseId: string;
  commodityId: string;
  quantity: number;
  date: string;
}