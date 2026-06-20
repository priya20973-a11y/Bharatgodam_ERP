'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Power, Trash2 } from "lucide-react";

interface WarehouseListProps {
  warehouses: any[];
  onEdit: (warehouse: any) => void;
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}

export default function WarehouseList({ 
  warehouses, 
  onEdit, 
  onToggleStatus, 
  onDelete, 
  isAdmin 
}: WarehouseListProps) {
  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">Name</TableHead>
            <TableHead className="font-semibold">Address</TableHead>
            <TableHead className="text-right font-semibold">Total Capacity (MT)</TableHead>
            <TableHead className="text-right font-semibold">Occupied (MT)</TableHead>
            <TableHead className="text-right font-semibold">Available (MT)</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="hidden lg:table-cell font-semibold">Added By</TableHead>
            <TableHead className="text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {warehouses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                No warehouses found. Start by adding one.
              </TableCell>
            </TableRow>
          ) : (
            warehouses.filter(w => w && w._id && w.name && typeof w.totalCapacity === 'number' && typeof w.occupiedCapacity === 'number').map((w) => {
              const availableCapacity = w.status === 'FULL' || w.status === 'INACTIVE' ? 0 : (w.totalCapacity - w.occupiedCapacity);
              return (
                <TableRow key={w._id.toString()} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-900">{w.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-slate-600" title={w.address}>{w.address}</TableCell>
                  <TableCell className="text-right text-slate-700">{w.totalCapacity.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-slate-700">{w.occupiedCapacity.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-slate-700">{availableCapacity.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === 'ACTIVE' ? 'success' : w.status === 'FULL' ? 'destructive' : 'secondary'}>
                      {w.status === 'FULL' ? 'Full' : w.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-slate-500">{w.addedBy || 'Unknown'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="Edit Warehouse"
                        className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all rounded-full h-8 w-8"
                        onClick={() => onEdit(w)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      {onToggleStatus && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title={w.status === 'INACTIVE' ? 'Activate Warehouse' : 'Deactivate Warehouse'}
                          className={`transition-all rounded-full h-8 w-8 ${
                            w.status === 'INACTIVE' 
                              ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50' 
                              : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                          }`}
                          onClick={() => onToggleStatus(w._id)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      )}

                      {isAdmin && onDelete && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Delete Warehouse"
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all rounded-full h-8 w-8"
                          onClick={() => onDelete(w._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
