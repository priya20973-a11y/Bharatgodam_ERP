'use client';

import React, { useState, useEffect } from 'react';
import { addColdUnit, updateColdUnit } from '@/app/actions/cold-units';
import { toast } from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
  onSuccessOptimistic?: (action: 'add' | 'edit', data: any) => void;
};

export default function ColdUnitForm({ isOpen, onClose, initialData, onSuccessOptimistic }: ModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!initialData;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (initialData && isOpen) {
      setName(initialData.name || '');
      setCode(initialData.code || '');
      setIsActive(initialData.isActive !== false);
    } else if (isOpen) {
      setName('');
      setCode('');
      setIsActive(true);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    if (!name.trim()) return 'Name is required';
    if (!code.trim()) return 'Code is required';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        isActive
      };

      const result = isEditing
        ? await updateColdUnit(initialData._id, data)
        : await addColdUnit(data);

      if (result.success) {
        toast.success(`Unit ${isEditing ? 'updated' : 'added'} successfully`);
        if (onSuccessOptimistic) {
          onSuccessOptimistic(isEditing ? 'edit' : 'add', result.data);
        }
        onClose();
      } else {
        toast.error(result.error || `Failed to ${isEditing ? 'update' : 'add'} unit`);
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">
            {isEditing ? 'Edit Unit' : 'Add Unit'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unit Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="e.g. Kilogram"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unit Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="e.g. KG"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                value={isActive ? 'true' : 'false'}
                onChange={(e) => setIsActive(e.target.value === 'true')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl shrink-0">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Add Unit'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
