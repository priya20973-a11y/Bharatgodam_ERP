'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Package, X } from 'lucide-react';
import { addCommodity, updateCommodity, deleteCommodity } from '@/app/actions/commodities';
import { toast, Toaster } from 'react-hot-toast';

interface GradingParameter {
  name: string;
  remarks: string;
  lowRange?: number | string;
  highRange?: number | string;
}

export default function CommoditiesDashboard({ initialData, isAdminUser }: { initialData: any[]; isAdminUser?: boolean }) {
  const [items, setItems] = useState(initialData);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', ratePerMtPerDay: 0 });
  const [gradingParameters, setGradingParameters] = useState<GradingParameter[]>([]);

  const handleAddParameter = () => {
    setGradingParameters([...gradingParameters, { name: '', remarks: '', lowRange: '', highRange: '' }]);
  };

  const handleRemoveParameter = (index: number) => {
    const newParams = [...gradingParameters];
    newParams.splice(index, 1);
    setGradingParameters(newParams);
  };

  const handleParameterChange = (index: number, field: keyof GradingParameter, value: string | number) => {
    const newParams = [...gradingParameters];
    newParams[index] = { ...newParams[index], [field]: value };
    setGradingParameters(newParams);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formattedParameters = gradingParameters
      .filter(p => p.name.trim() !== '')
      .map(p => ({
        ...p,
        lowRange: p.lowRange !== '' && p.lowRange !== undefined ? Number(p.lowRange) : undefined,
        highRange: p.highRange !== '' && p.highRange !== undefined ? Number(p.highRange) : undefined,
      }));

    const payload = {
      ...formData,
      gradingParameters: formattedParameters
    };

    const res = editingId 
      ? await updateCommodity(editingId, payload)
      : await addCommodity(payload);

    if (res.success) {
      toast.success(editingId ? 'Commodity updated' : 'Commodity added');
      window.location.reload();
    } else {
      toast.error(res.error || 'Operation failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this commodity?')) {
      const res = await deleteCommodity(id);
      if (res.success) {
        toast.success('Commodity deleted');
        window.location.reload();
      }
    }
  }

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: '', ratePerMtPerDay: 0 });
    setGradingParameters([]);
  };

  const handleEditClick = (item: any) => {
    setEditingId(item._id);
    setFormData({ name: item.name, ratePerMtPerDay: item.ratePerMtPerDay });
    setGradingParameters(item.gradingParameters || []);
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Package className="h-5 w-5 text-indigo-600" />
          {editingId ? 'Adjust Commodity Settings' : 'Register New Commodity'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Commodity Name *</label>
            <Input 
              required 
              value={formData.name} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })} 
              placeholder="e.g. WHEAT"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rate (₹/MT/Day) *</label>
            <Input 
              required 
              type="number" 
              step="0.01"
              value={formData.ratePerMtPerDay} 
              onChange={(e) => setFormData({ ...formData, ratePerMtPerDay: Number(e.target.value) })} 
              placeholder="6.00"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-semibold text-slate-800">Grading Parameters (Optional)</label>
            <Button type="button" variant="outline" size="sm" onClick={handleAddParameter} className="gap-2">
              <Plus className="h-4 w-4" /> Add Parameter
            </Button>
          </div>
          
          <div className="space-y-3">
            {gradingParameters.map((param, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg relative group">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full pr-8">
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">Parameter Name *</label>
                    <Input 
                      required
                      value={param.name} 
                      onChange={(e) => handleParameterChange(index, 'name', e.target.value)} 
                      placeholder="e.g. Moisture"
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">Low Range</label>
                    <Input 
                      type="number"
                      step="any"
                      value={param.lowRange ?? ''} 
                      onChange={(e) => handleParameterChange(index, 'lowRange', e.target.value)} 
                      placeholder="e.g. 8"
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">High Range</label>
                    <Input 
                      type="number"
                      step="any"
                      value={param.highRange ?? ''} 
                      onChange={(e) => handleParameterChange(index, 'highRange', e.target.value)} 
                      placeholder="e.g. 12"
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">Remarks / Standard</label>
                    <Input 
                      value={param.remarks} 
                      onChange={(e) => handleParameterChange(index, 'remarks', e.target.value)} 
                      placeholder="e.g. Max 12%"
                      className="bg-white"
                    />
                  </div>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleRemoveParameter(index)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            {gradingParameters.length === 0 && (
              <p className="text-sm text-slate-500 italic py-2">No grading parameters added.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {editingId && (
            <Button variant="outline" type="button" onClick={resetForm}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {editingId ? 'Update Commodity' : 'Add Commodity'}
          </Button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Commodity</TableHead>
              <TableHead className="font-bold">Daily Rate (₹/MT)</TableHead>
              <TableHead className="font-bold">Added By</TableHead>
              <TableHead className="text-right font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items && items.length > 0 ? (
              items.filter(item => item && item._id).map((item) => (
                <TableRow key={item._id.toString()}>
                  <TableCell className="font-bold tracking-tight text-slate-900">
                    <div>{item.name}</div>
                    {item.gradingParameters && item.gradingParameters.length > 0 && (
                      <div className="text-xs text-slate-500 mt-1 font-normal">
                        {item.gradingParameters.length} Grading Parameter(s)
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                      ₹{item.ratePerMtPerDay ? item.ratePerMtPerDay.toFixed(2) : '0.00'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{item.wspName || 'Unknown'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(item._id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No commodities found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
