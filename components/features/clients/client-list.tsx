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
import { Edit, User } from "lucide-react";

interface ClientListProps {
  clients: any[];
  commodities?: any[];
  onEdit: (client: any) => void;
}

export default function ClientList({ clients, commodities = [], onEdit }: ClientListProps) {
  const commodityMap = new Map(commodities.map((item) => [item._id?.toString() || item.id, item.name]));

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead className="hidden md:table-cell">Commodity</TableHead>
            <TableHead className="hidden md:table-cell">PAN</TableHead>
            <TableHead className="hidden md:table-cell">GSTIN</TableHead>
            <TableHead className="hidden lg:table-cell">Added By</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                No clients registered.
              </TableCell>
            </TableRow>
          ) : (
            clients.filter(c => c && c._id).map((c) => {
              const commodityNames = (c.commodityIds || []).map((id: string) => commodityMap.get(id) || id);
              return (
                <TableRow key={c._id.toString()}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    {c.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {c.clientType}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.address}</TableCell>
                  <TableCell>{c.mobile}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-slate-600">
                    {commodityNames.length > 0 ? commodityNames.join(', ') : 'Any'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.panNumber || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.gstNumber || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-slate-600">{c.addedBy || 'Unknown'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(c)}>
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
