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
import { deleteAssayer } from "@/app/actions/assayer-actions";
import { toast } from "sonner";
import { useState } from "react";

interface AssayerListProps {
  assayers: any[];
  onEdit: (assayer: any) => void;
  onRefresh: () => void;
}

export default function AssayerList({ assayers, onEdit, onRefresh }: AssayerListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Assayer?')) return;
    
    setDeletingId(id);
    try {
      const res = await deleteAssayer(id);
      if (res.success) {
        toast.success('Assayer deleted successfully');
        onRefresh();
      } else {
        toast.error(res.error || 'Failed to delete assayer');
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
            <TableHead>Assayer Name</TableHead>
            <TableHead>Licence Number</TableHead>
            <TableHead>Licence Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assayers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                No assayer records are available.
              </TableCell>
            </TableRow>
          ) : (
            assayers.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="font-medium text-slate-900">{a.name}</TableCell>
                <TableCell className="text-slate-600">{a.licenceNumber}</TableCell>
                <TableCell>
                  <Badge 
                    variant={a.status === 'Active' ? 'default' : 'destructive'} 
                    className={a.status === 'Active' ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}
                  >
                    {a.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onEdit(a)} 
                    className="hover:bg-indigo-50 hover:text-indigo-600"
                    disabled={deletingId === a._id}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(a._id)} 
                    className="hover:bg-red-50 hover:text-red-600"
                    disabled={deletingId === a._id}
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
