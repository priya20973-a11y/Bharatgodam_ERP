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

interface PledgeeListProps {
  pledgees: any[];
  onEdit: (pledgee: any) => void;
}

export default function PledgeeList({ pledgees, onEdit }: PledgeeListProps) {
  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead>Pledgee Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>IIFC Code</TableHead>
            <TableHead>Person Name</TableHead>
            <TableHead>Number</TableHead>
            <TableHead className="hidden md:table-cell">Address</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pledgees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                No pledgee records are available.
              </TableCell>
            </TableRow>
          ) : (
            pledgees.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-slate-50">
                    {p.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-600">{p.type === 'Bank' ? p.iifcCode : '—'}</TableCell>
                <TableCell className="text-slate-600">{p.personName || '—'}</TableCell>
                <TableCell className="text-slate-600">{p.mobile || '—'}</TableCell>
                <TableCell className="hidden md:table-cell text-slate-600 truncate max-w-[200px]" title={p.address}>
                  {p.address || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(p)} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
