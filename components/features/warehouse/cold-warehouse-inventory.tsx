'use client';

import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Package, TrendingUp, AlertTriangle, Building2, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { formatWeight } from '@/lib/utils'; // Make sure this formats Kg properly if needed, usually handles numbers

interface CommodityData {
  commodityName: string;
  totalWeight: number;
  bookingCount: number;
}

interface WarehouseStats {
  total_capacity: number;
  used_capacity: number;
  available_capacity: number;
  utilization_percentage: number;
  warehouse_id: string;
  warehouse_name: string;
}

interface WarehouseOption {
  warehouse_id: string;
  warehouse_name: string;
  total_capacity: number;
}

interface ChamberOption {
  chamberNo: number;
  name: string;
}

interface FloorOption {
  floorNo: number;
  name: string;
}

interface InventoryResponse {
  success: boolean;
  commodities: CommodityData[];
  warehouse_stats: WarehouseStats;
  warehouses: WarehouseOption[];
  chambers: ChamberOption[];
  floors: FloorOption[];
  message?: string;
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];

export default function ColdWarehouseInventory() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [chambers, setChambers] = useState<ChamberOption[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedChamber, setSelectedChamber] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchInventoryData();
  }, []);

  const fetchInventoryData = async (warehouseId?: string, chamberNo?: string, floorNo?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (warehouseId) params.append('warehouseId', warehouseId);
      if (chamberNo) params.append('chamberNo', chamberNo);
      if (floorNo) params.append('floorNo', floorNo);

      const query = params.toString();
      const response = await fetch(`/api/cold/warehouse/inventory${query ? `?${query}` : ''}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch inventory data (${response.status})`);
      }

      const result: InventoryResponse = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'API returned error');
      }

      setData(result);
      setWarehouses(result.warehouses || []);
      setChambers(result.chambers || []);
      setFloors(result.floors || []);

      if (result.warehouse_stats?.warehouse_id && !warehouseId) {
        setSelectedWarehouse(result.warehouse_stats.warehouse_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    setSelectedChamber('');
    setSelectedFloor('');
    fetchInventoryData(warehouseId, '', '');
  };

  const handleChamberChange = (chamberNo: string) => {
    setSelectedChamber(chamberNo);
    setSelectedFloor('');
    fetchInventoryData(selectedWarehouse, chamberNo, '');
  };

  const handleFloorChange = (floorNo: string) => {
    setSelectedFloor(floorNo);
    fetchInventoryData(selectedWarehouse, selectedChamber, floorNo);
  };

  const getCapacityStatus = (percentage: number) => {
    if (percentage >= 90) {
      return {
        color: 'text-rose-600',
        bg: 'bg-rose-50/50',
        accent: 'bg-rose-500',
        icon: AlertTriangle,
        status: 'Critical'
      };
    }
    if (percentage >= 75) {
      return {
        color: 'text-amber-600',
        bg: 'bg-amber-50/50',
        accent: 'bg-amber-500',
        icon: TrendingUp,
        status: 'High'
      };
    }
    return {
      color: 'text-emerald-600',
      bg: 'bg-emerald-50/50',
      accent: 'bg-emerald-500',
      icon: Package,
      status: 'Optimal'
    };
  };

  const formatKg = (kg: number) => {
    // Cold storage uses Kg directly, format it nicely
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(kg) + ' Kg';
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
        <p className="text-slate-400 text-xs mt-2 font-medium">Fetching inventory analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4">
        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
          <AlertTriangle className="h-6 w-6 text-rose-500" />
          <h4 className="font-bold text-slate-800 text-sm mt-2">Error loading inventory</h4>
          <p className="text-slate-500 text-xs mt-0.5">{error}</p>
          <button
            onClick={() => fetchInventoryData(selectedWarehouse, selectedChamber, selectedFloor)}
            className="mt-3 flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition active:scale-95 shadow-sm"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Try Again</span>
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { commodities, warehouse_stats } = data;
  const usedCapacity = warehouse_stats.used_capacity;
  const availableCapacity = warehouse_stats.available_capacity;
  const utilizationPercentage = warehouse_stats.utilization_percentage;
  const capacityStatus = getCapacityStatus(utilizationPercentage);

  const chartData = commodities.map((commodity, index) => ({
    name: commodity.commodityName,
    value: commodity.totalWeight,
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-500" />
            Cold Warehouse Inventory
          </h2>
          <p className="text-xs text-slate-500">Commodity capacity & share tracking</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <select
              value={selectedWarehouse}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border border-slate-205 rounded-xl bg-white text-slate-750 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer hover:bg-slate-50/50"
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                  {warehouse.warehouse_name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 pointer-events-none h-3.5 w-3.5 text-slate-400" />
          </div>

          {chambers.length > 0 && (
            <div className="relative flex items-center">
              <select
                value={selectedChamber}
                onChange={(e) => handleChamberChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 border border-slate-205 rounded-xl bg-white text-slate-750 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer hover:bg-slate-50/50"
              >
                <option value="">All Chambers</option>
                {chambers.map((chamber) => (
                  <option key={chamber.chamberNo} value={chamber.chamberNo}>
                    {chamber.name || `Chamber ${chamber.chamberNo}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 pointer-events-none h-3.5 w-3.5 text-slate-400" />
            </div>
          )}

          {selectedChamber && floors.length > 0 && (
            <div className="relative flex items-center">
              <select
                value={selectedFloor}
                onChange={(e) => handleFloorChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 border border-slate-205 rounded-xl bg-white text-slate-750 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer hover:bg-slate-50/50"
              >
                <option value="">All Floors</option>
                {floors.map((floor) => (
                  <option key={floor.floorNo} value={floor.floorNo}>
                    {floor.name || `Floor ${floor.floorNo}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 pointer-events-none h-3.5 w-3.5 text-slate-400" />
            </div>
          )}

          <button
            onClick={() => fetchInventoryData(selectedWarehouse, selectedChamber, selectedFloor)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white text-slate-650 text-xs font-semibold rounded-xl hover:bg-slate-50 transition shadow-sm group"
          >
            <RefreshCw className={`h-3 w-3 text-slate-400 transition-transform duration-500 group-hover:rotate-180 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Info/Progress vs Donut Chart */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
        {/* Left: Utilization Metrics & Cards (3 columns) */}
        <div className="md:col-span-3 space-y-4">
          {/* Progress fill rate */}
          <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/80">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
              <span>Capacity Fill Rate</span>
              <span className={capacityStatus.color}>{utilizationPercentage}% Utilized</span>
            </div>
            <div className="w-full bg-slate-200/60 rounded-full h-3 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${utilizationPercentage >= 90 ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                    utilizationPercentage >= 75 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                      'bg-gradient-to-r from-teal-400 to-emerald-500'
                  }`}
                style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-3xs text-slate-400 mt-1 font-semibold">
              <span>0 Kg</span>
              <span>{formatKg(warehouse_stats.total_capacity)}</span>
            </div>
          </div>

          {/* Quick Metrics Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-2xs">
              <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">Total</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{formatKg(warehouse_stats.total_capacity)}</p>
            </div>
            <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-2xs">
              <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">Used</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{formatKg(warehouse_stats.used_capacity)}</p>
            </div>
            <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-2xs">
              <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">Available</p>
              <p className={`text-sm font-black mt-0.5 ${capacityStatus.color}`}>{formatKg(availableCapacity)}</p>
            </div>
          </div>
        </div>

        {/* Right: Small Donut Chart (2 columns) */}
        <div className="md:col-span-2 flex justify-center relative">
          {mounted ? (
            <div className="relative w-full h-48 max-w-[200px] flex items-center justify-center">
              {/* Donut Center Label Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-2xs font-bold uppercase tracking-widest text-slate-400">Used</p>
                <p className="text-3xl font-black text-slate-800 tracking-tighter mt-0.5">
                  {utilizationPercentage}%
                </p>
              </div>

              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} className="focus:outline-none" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [typeof value === 'number' ? formatKg(value) : '0 Kg', 'Weight']}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #f1f5f9',
                      borderRadius: '12px',
                      fontSize: '10px',
                      boxShadow: '0 2px 4px rgb(0 0 0 / 0.05)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 w-32 rounded-full border-4 border-slate-100 border-t-indigo-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Commodity Breakdown Rows */}
      {commodities.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-3xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">Stored Commodity Shares</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {commodities.map((commodity, index) => {
              const sharePercentage = usedCapacity > 0 ? (commodity.totalWeight / usedCapacity) * 100 : 0;
              const color = COLORS[index % COLORS.length];

              return (
                <div key={`${commodity.commodityName}-${index}`} className="flex items-center justify-between p-2 bg-slate-50/50 hover:bg-slate-50 rounded-xl border border-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-bold text-slate-700 truncate">{commodity.commodityName}</span>
                    <span className="text-3xs text-slate-400 font-semibold">({commodity.bookingCount} bookings)</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-black text-slate-800">{formatKg(commodity.totalWeight)}</span>
                    <span className="text-3xs font-bold text-slate-400 bg-white border border-slate-100 px-1 py-0.5 rounded">
                      {sharePercentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
