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
import { Power, Trash2, Pencil } from "lucide-react";
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdWarehouseListProps {
  warehouses: any[];
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (warehouse: any) => void;
  isAdmin?: boolean;
}

export default function ColdWarehouseList({ 
  warehouses, 
  onToggleStatus, 
  onDelete, 
  onEdit,
  isAdmin 
}: ColdWarehouseListProps) {
  const { t, formatNumber } = useColdTranslation();

  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">{t('warehouses.warehouseId')}</TableHead>
            <TableHead className="font-semibold">{t('warehouses.name')}</TableHead>
            <TableHead className="font-semibold">{t('warehouses.address')}</TableHead>
            <TableHead className="text-right font-semibold">{t('warehouses.chambers')}</TableHead>
            <TableHead className="text-right font-semibold">{t('warehouses.floors')}</TableHead>
            <TableHead className="text-right font-semibold">{t('warehouses.stacks')}</TableHead>
            <TableHead className="text-right font-semibold">{t('warehouses.totalCapacity')}</TableHead>
            <TableHead className="font-semibold">{t('warehouses.status')}</TableHead>
            <TableHead className="text-right font-semibold">{t('warehouses.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {warehouses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                {t('warehouses.noWarehousesFound')}
              </TableCell>
            </TableRow>
          ) : (
            warehouses.map((w) => {
              return (
                <TableRow key={w._id.toString()} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-slate-600">{w.warehouseId || '-'}</TableCell>
                  <TableCell className="font-medium text-slate-900">{w.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-slate-600" title={w.address}>{w.address}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.noOfChambers)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.noOfFloors)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.noOfStacks)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.totalCapacity || 0)}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {w.status === 'ACTIVE' ? t('warehouses.active') : t('warehouses.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                      {onEdit && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title={t('warehouses.editWarehouse') || 'Edit Warehouse'}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all rounded-full h-8 w-8"
                          onClick={() => onEdit(w)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {onToggleStatus && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title={w.status === 'INACTIVE' ? t('warehouses.activateWarehouse') : t('warehouses.deactivateWarehouse')}
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
                          title={t('warehouses.deleteWarehouse')}
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
