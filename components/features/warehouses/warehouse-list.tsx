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
import { Edit } from "lucide-react";

interface WarehouseListProps {
  warehouses: any[];
  onEdit: (warehouse: any) => void;
}

export default function WarehouseList({ warehouses, onEdit }: WarehouseListProps) {
  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead className="text-right">Total Capacity (MT)</TableHead>
            <TableHead className="text-right">Occupied (MT)</TableHead>
            <TableHead className="text-right">Available (MT)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Added By</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {warehouses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center">
                No warehouses found. Start by adding one.
              </TableCell>
            </TableRow>
          ) : (
            warehouses.filter(w => w && w._id && w.name && typeof w.totalCapacity === 'number' && typeof w.occupiedCapacity === 'number').map((w) => {
              const availableCapacity = w.totalCapacity - w.occupiedCapacity;
              return (
                <TableRow key={w._id.toString()}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={w.address}>{w.address}</TableCell>
                  <TableCell className="text-right">{w.totalCapacity.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{w.occupiedCapacity.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{availableCapacity.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === 'ACTIVE' ? 'success' : w.status === 'FULL' ? 'destructive' : 'secondary'}>
                      {w.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-slate-600">{w.addedBy || 'Unknown'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(w)}>
                      <Edit className="h-4 w-4" />
                    </Button>
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
