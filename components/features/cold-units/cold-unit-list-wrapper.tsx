'use client';

import React, { useState } from 'react';
import { Plus, Pencil, Search, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { deleteColdUnit, toggleColdUnitStatus } from '@/app/actions/cold-units';
import { toast } from 'react-hot-toast';
import ColdUnitForm from './cold-unit-form';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

type Props = {
  initialUnits: any[];
};

export default function ColdUnitListWrapper({ initialUnits }: Props) {
  const { t } = useColdTranslation();
  const [units, setUnits] = useState(initialUnits);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);

  const filteredUnits = units.filter((u: any) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddClick = () => {
    setEditingUnit(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (unit: any) => {
    setEditingUnit(unit);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const result = await toggleColdUnitStatus(id, !currentStatus);
    if (result.success) {
      setUnits(units.map((u: any) => u._id === id ? result.data : u));
      toast.success(`Unit ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
    } else {
      toast.error(result.error || 'Failed to toggle status');
    }
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the unit "${name}"?`)) {
      const result = await deleteColdUnit(id);
      if (result.success) {
        setUnits(units.filter((u: any) => u._id !== id));
        toast.success('Unit deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete unit');
      }
    }
  };

  const handleOptimisticUpdate = (action: 'add' | 'edit', data: any) => {
    if (action === 'add') {
      setUnits([data, ...units]);
    } else {
      setUnits(units.map((u: any) => u._id === data._id ? data : u));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Unit Master</h1>
        <p className="text-slate-500">
          Manage measurement units for commodities (e.g. Kg, Bags, Tons, Nos, Liters).
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
          />
        </div>
        
        <button
          onClick={handleAddClick}
          className="flex items-center justify-center w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md shadow-indigo-200 transition-all shrink-0"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Unit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredUnits.map((unit: any) => (
          <div key={unit._id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative group">
            <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-100 p-1">
              <button
                onClick={() => handleEditClick(unit)}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="Edit Unit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <div className="w-px bg-slate-200 mx-1" />
              <button
                onClick={() => handleToggleStatus(unit._id, unit.isActive)}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title={unit.isActive ? "Deactivate" : "Activate"}
              >
                {unit.isActive ? <ToggleLeft className="h-4 w-4 text-emerald-600" /> : <ToggleRight className="h-4 w-4 text-slate-400" />}
              </button>
              <div className="w-px bg-slate-200 mx-1" />
              <button
                onClick={() => handleDeleteClick(unit._id, unit.name)}
                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="Delete Unit"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 mt-2">
              <h3 className="text-xl font-bold text-slate-800">{unit.name}</h3>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${unit.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {unit.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm font-medium text-slate-500">Unit Code</span>
                <span className="text-sm font-semibold text-slate-800">{unit.code}</span>
              </div>
            </div>
          </div>
        ))}

        {filteredUnits.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <h3 className="text-lg font-medium text-slate-900 mb-1">No units found</h3>
            <p className="text-slate-500">Get started by creating a new measurement unit.</p>
          </div>
        )}
      </div>

      <ColdUnitForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={editingUnit}
        onSuccessOptimistic={handleOptimisticUpdate}
      />
    </div>
  );
}
