'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getStockReport } from '@/app/actions/stock-report-actions';
import { toast } from 'react-hot-toast';

export default function StockReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<{label: string, value: string}[]>([]);
  const [warehouses, setWarehouses] = useState<{label: string, value: string}[]>([]);
  
  const [clientFilter, setClientFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getStockReport({
        clientId: clientFilter,
        warehouseId: warehouseFilter
      });
      if (res.success) {
        setData(res.data || []);
        if (clients.length === 0 && res.clients) setClients(res.clients);
        if (warehouses.length === 0 && res.warehouses) setWarehouses(res.warehouses);
      } else {
        toast.error(res.error || 'Failed to fetch stock report');
      }
    } catch (err: any) {
      toast.error('Error loading report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clientFilter, warehouseFilter]);

  const groupedData = useMemo(() => {
    const clientsMap = new Map<string, {
      clientId: string;
      clientName: string;
      warehousesMap: Map<string, {
        warehouseId: string;
        warehouseName: string;
        commodities: any[];
        totalQuantity: number;
        totalBags: number;
      }>;
      totalQuantity: number;
      totalBags: number;
    }>();

    let filtered = data;
    if (search) {
      const s = search.toLowerCase();
      filtered = data.filter(d => 
        (d.clientName || '').toLowerCase().includes(s) ||
        (d.warehouseName || '').toLowerCase().includes(s) ||
        (d.commodityName || '').toLowerCase().includes(s)
      );
    }

    filtered.forEach(row => {
      if (!clientsMap.has(row.clientId)) {
        clientsMap.set(row.clientId, {
          clientId: row.clientId,
          clientName: row.clientName,
          warehousesMap: new Map(),
          totalQuantity: 0,
          totalBags: 0
        });
      }
      
      const clientGroup = clientsMap.get(row.clientId)!;
      
      if (!clientGroup.warehousesMap.has(row.warehouseId)) {
        clientGroup.warehousesMap.set(row.warehouseId, {
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          commodities: [],
          totalQuantity: 0,
          totalBags: 0
        });
      }
      
      const warehouseGroup = clientGroup.warehousesMap.get(row.warehouseId)!;
      warehouseGroup.commodities.push(row);
      warehouseGroup.totalQuantity += row.totalQuantity;
      warehouseGroup.totalBags += row.totalBags;
      
      clientGroup.totalQuantity += row.totalQuantity;
      clientGroup.totalBags += row.totalBags;
    });

    return Array.from(clientsMap.values()).map(c => ({
      ...c,
      warehouses: Array.from(c.warehousesMap.values())
    })).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [data, search]);

  const handleExportCSV = () => {
    const headers = ['Client', 'Warehouse', 'Commodity', 'Quantity (MT)', 'Bags'];
    const rows: string[][] = [];

    groupedData.forEach(client => {
      client.warehouses.forEach(warehouse => {
        warehouse.commodities.forEach(comm => {
          rows.push([
            client.clientName,
            warehouse.warehouseName,
            comm.commodityName,
            comm.totalQuantity.toFixed(3),
            comm.totalBags.toString()
          ]);
        });
        // Warehouse Total
        rows.push([
          client.clientName,
          `${warehouse.warehouseName} Total`,
          '-',
          warehouse.totalQuantity.toFixed(3),
          warehouse.totalBags.toString()
        ]);
      });
      // Client Total
      rows.push([
        `${client.clientName} Grand Total`,
        '-',
        '-',
        client.totalQuantity.toFixed(3),
        client.totalBags.toString()
      ]);
      // Empty row for spacing
      rows.push(['', '', '', '', '']);
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stock_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search Client, Warehouse, Commodity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Clients</SelectItem>
            {clients.map((c: any) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger><SelectValue placeholder="All Warehouses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Warehouses</SelectItem>
            {warehouses.map((w: any) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} className="w-12 px-0 shrink-0" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={handleExportCSV} className="w-full flex-1" disabled={data.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="font-semibold text-slate-700 w-1/4">Client / Warehouse</TableHead>
              <TableHead className="font-semibold text-slate-700 w-1/4">Commodity</TableHead>
              <TableHead className="font-semibold text-slate-700 text-right w-1/4">Quantity (MT)</TableHead>
              <TableHead className="font-semibold text-slate-700 text-right w-1/4">Total Bags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  Loading stock data...
                </TableCell>
              </TableRow>
            ) : groupedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  No stock found for the selected criteria.
                </TableCell>
              </TableRow>
            ) : (
              groupedData.map((client) => (
                <React.Fragment key={client.clientId}>
                  {/* Client Header */}
                  <TableRow className="bg-indigo-50/50 hover:bg-indigo-50/80 transition-colors">
                    <TableCell colSpan={4} className="font-bold text-indigo-900 border-b-indigo-100">
                      Client: {client.clientName}
                    </TableCell>
                  </TableRow>
                  
                  {client.warehouses.map((warehouse) => (
                    <React.Fragment key={`${client.clientId}-${warehouse.warehouseId}`}>
                      {/* Commodity Rows for Warehouse */}
                      {warehouse.commodities.map((comm) => (
                        <TableRow key={`${client.clientId}-${warehouse.warehouseId}-${comm.commodityName}`} className="hover:bg-slate-50 transition-colors border-b-slate-100">
                          <TableCell className="text-slate-600 pl-8">{warehouse.warehouseName}</TableCell>
                          <TableCell className="text-slate-700 font-medium">{comm.commodityName}</TableCell>
                          <TableCell className="text-right font-medium text-slate-900">{comm.totalQuantity.toFixed(3)}</TableCell>
                          <TableCell className="text-right text-slate-700">{comm.totalBags}</TableCell>
                        </TableRow>
                      ))}
                      
                      {/* Warehouse Total */}
                      <TableRow className="bg-slate-50/80 hover:bg-slate-100/80 transition-colors border-b-slate-200">
                        <TableCell className="font-semibold text-slate-800 pl-8">
                          {warehouse.warehouseName} Total
                        </TableCell>
                        <TableCell className="text-slate-500">-</TableCell>
                        <TableCell className="text-right font-bold text-slate-900">{warehouse.totalQuantity.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-800">{warehouse.totalBags}</TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  
                  {/* Client Grand Total */}
                  <TableRow className="bg-indigo-100/50 hover:bg-indigo-100 transition-colors border-b-indigo-200">
                    <TableCell className="font-bold text-indigo-950">
                      {client.clientName} Grand Total
                    </TableCell>
                    <TableCell className="text-indigo-400">-</TableCell>
                    <TableCell className="text-right font-black text-indigo-950">{client.totalQuantity.toFixed(3)}</TableCell>
                    <TableCell className="text-right font-black text-indigo-900">{client.totalBags}</TableCell>
                  </TableRow>
                  
                  {/* Spacer */}
                  <TableRow className="h-4 border-none bg-transparent">
                    <TableCell colSpan={4} className="p-0 border-none"></TableCell>
                  </TableRow>
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
