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
import { Edit, Trash2 } from "lucide-react";
import { deleteColdPledgee } from "@/app/actions/cold-pledgee-actions";
import { toast } from "sonner";
import { useState } from "react";

interface ColdPledgeeListProps {
  pledgees: any[];
  onEdit: (pledgee: any) => void;
  onRefresh?: () => void;
}

export default function ColdPledgeeList({ pledgees, onEdit, onRefresh }: ColdPledgeeListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Pledgee?')) return;

    setDeletingId(id);
    try {
      const res = await deleteColdPledgee(id);
      if (res.success) {
        toast.success('Pledgee deleted successfully');
        onRefresh?.();
      } else {
        toast.error(res.error || 'Failed to delete pledgee');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setDeletingId(null);
    }
  };

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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onEdit(p)} 
                    className="hover:bg-cyan-50 hover:text-cyan-700"
                    disabled={deletingId === p._id}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(p._id)} 
                    className="hover:bg-red-50 hover:text-red-600"
                    disabled={deletingId === p._id}
                  >
                    <Trash2 className="h-4 w-4" />
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
