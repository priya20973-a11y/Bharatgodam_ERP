'use client';

import { useState, useEffect } from 'react';
import { createColdWarehouse, updateColdWarehouse } from '@/app/actions/cold-warehouse-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { toast } from 'react-hot-toast';
import { Trash2, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdWarehouseFormProps {
  onSuccess: () => void;
  initialData?: any;
  onCancel?: () => void;
}

export default function ColdWarehouseForm({ onSuccess, initialData, onCancel }: ColdWarehouseFormProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);
  const isEdit = !!initialData;

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    warehouseId: initialData?.warehouseId || '',
    address: initialData?.address || '',
    noOfChambers: initialData?.noOfChambers || 1,
    noOfFloors: initialData?.noOfFloors || 1,
    noOfStacks: initialData?.noOfStacks || 1,
    stackCapacity: initialData?.stackCapacity || 0,
    bufferCapacity: initialData?.bufferCapacity || 0,
    stackLayout: initialData?.stackLayout || 'ROW_WISE',
    gridRows: initialData?.gridRows || 0,
    gridCols: initialData?.gridCols || 0,
  });

  const [customLayout, setCustomLayout] = useState<{ rowIndex: number, colIndex: number, stackNo: number }[]>(initialData?.customLayout || []);

  const [referencePersons, setReferencePersons] = useState(
    initialData?.referencePersons?.length > 0 
      ? initialData.referencePersons 
      : [{ name: '', mobile: '', email: '', designation: '' }]
  );

  const [aadhaarNo, setAadhaarNo] = useState(initialData?.aadhaarNo || '');
  const [panNo, setPanNo] = useState(initialData?.panNo || '');
  const [gstin, setGstin] = useState(initialData?.gstin || '');
  const [warehouseLogo, setWarehouseLogo] = useState(initialData?.warehouseLogo || '');
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.warehouseLogo || null);
  const [bankDetails, setBankDetails] = useState({
    bankName: initialData?.bankDetails?.bankName || '',
    accountNo: initialData?.bankDetails?.accountNo || '',
    ifsc: initialData?.bankDetails?.ifsc || '',
    branch: initialData?.bankDetails?.branch || '',
  });

  const initialChamberNames = initialData?.chambers?.map((c: any) => c.name) || Array(initialData?.noOfChambers || 1).fill('');
  const [chamberNames, setChamberNames] = useState<string[]>(initialChamberNames);

  // Initialize floor names from the first chamber since they are applied globally
  const initialFloorNames = initialData?.chambers?.[0]?.floors?.map((f: any) => f.name) || Array(initialData?.noOfFloors || 1).fill('');
  const [floorNames, setFloorNames] = useState<string[]>(initialFloorNames);

  const hasCustomNames = isEdit ? (initialData?.chambers?.some((c: any) => isNaN(Number(c.name))) || initialData?.chambers?.[0]?.floors?.some((f: any) => isNaN(Number(f.name)))) : false;
  const [useCustomNames, setUseCustomNames] = useState<boolean>(hasCustomNames || false);

  useEffect(() => {
    if (!isEdit) {
      setChamberNames((prev) => {
        const next = [...prev];
        if (formData.noOfChambers > next.length) {
          next.push(...Array(formData.noOfChambers - next.length).fill(''));
        } else if (formData.noOfChambers < next.length) {
          next.length = formData.noOfChambers;
        }
        return next;
      });
      setFloorNames((prev) => {
        const next = [...prev];
        if (formData.noOfFloors > next.length) {
          next.push(...Array(formData.noOfFloors - next.length).fill(''));
        } else if (formData.noOfFloors < next.length) {
          next.length = formData.noOfFloors;
        }
        return next;
      });
    }
  }, [formData.noOfChambers, formData.noOfFloors, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        warehouseId: formData.warehouseId,
        customLayout: formData.stackLayout === 'CUSTOM' ? customLayout : undefined,
        referencePersons: referencePersons.filter((rp: any) => rp.name.trim() !== ''),
        aadhaarNo,
        panNo,
        gstin,
        bankDetails,
        warehouseLogo,
        chamberNames: useCustomNames ? chamberNames : Array.from({ length: formData.noOfChambers }).map((_, i) => String(i + 1)),
        floorNames: useCustomNames ? floorNames : Array.from({ length: formData.noOfFloors }).map((_, i) => String(i + 1)),
        chambers: isEdit ? initialData.chambers.map((c: any, i: number) => ({ ...c, name: useCustomNames ? chamberNames[i] : String(i + 1) })) : undefined,
      };
      
      if (formData.stackLayout === 'CUSTOM' && customLayout.length !== formData.noOfStacks) {
        toast.error(`Please map all ${formData.noOfStacks} stacks in the custom layout.`);
        setLoading(false);
        return;
      }

      if (['ROW_WISE', 'COLUMN_WISE', 'REVERSE_ROW_WISE', 'REVERSE_COLUMN_WISE', 'CUSTOM'].includes(formData.stackLayout)) {
        if (!formData.gridRows || !formData.gridCols || formData.gridRows * formData.gridCols < formData.noOfStacks) {
          toast.error(`Grid dimensions (${formData.gridRows}x${formData.gridCols}) must be at least ${formData.noOfStacks} to fit all stacks.`);
          setLoading(false);
          return;
        }
      }

      let res;
      if (isEdit) {
        res = await updateColdWarehouse(initialData._id, payload);
      } else {
        res = await createColdWarehouse(payload);
      }

      if (res.success) {
        toast.success(isEdit ? t('warehouses.warehouseUpdated') || 'Warehouse updated successfully' : t('warehouses.warehouseCreated'));
        onSuccess();
      } else {
        toast.error(res.error || (isEdit ? 'Failed to update warehouse' : t('warehouses.warehouseCreationFailed')));
      }
    } catch (err) {
      toast.error(t('warehouses.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const addReferencePerson = () => {
    setReferencePersons([...referencePersons, { name: '', mobile: '', email: '', designation: '' }]);
  };

  const removeReferencePerson = (index: number) => {
    setReferencePersons(referencePersons.filter((_: any, i: number) => i !== index));
  };

  const updateReferencePerson = (index: number, field: string, value: string) => {
    const updated = [...referencePersons];
    updated[index] = { ...updated[index], [field]: value };
    setReferencePersons(updated);
  };

  const renderLivePreview = () => {
    if (formData.stackLayout === 'CUSTOM' || formData.gridRows <= 0 || formData.gridCols <= 0) return null;

    let gridCells: (number | null)[][] = Array.from({ length: formData.gridRows }).map(() => Array(formData.gridCols).fill(null));
    let sNo = 1;
    if (formData.stackLayout === 'ROW_WISE') {
      for (let r = 0; r < formData.gridRows; r++) {
        for (let c = 0; c < formData.gridCols; c++) {
          if (sNo <= formData.noOfStacks) gridCells[r][c] = sNo++;
        }
      }
    } else if (formData.stackLayout === 'REVERSE_ROW_WISE') {
      for (let r = 0; r < formData.gridRows; r++) {
        for (let c = formData.gridCols - 1; c >= 0; c--) {
          if (sNo <= formData.noOfStacks) gridCells[r][c] = sNo++;
        }
      }
    } else if (formData.stackLayout === 'COLUMN_WISE') {
      for (let c = 0; c < formData.gridCols; c++) {
        for (let r = 0; r < formData.gridRows; r++) {
          if (sNo <= formData.noOfStacks) gridCells[r][c] = sNo++;
        }
      }
    } else if (formData.stackLayout === 'REVERSE_COLUMN_WISE') {
      for (let c = formData.gridCols - 1; c >= 0; c--) {
        for (let r = 0; r < formData.gridRows; r++) {
          if (sNo <= formData.noOfStacks) gridCells[r][c] = sNo++;
        }
      }
    }

    return (
      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-md">
        <h5 className="text-sm font-medium mb-2 text-indigo-700">Live Layout Preview {isEdit && "(Read-Only)"}</h5>
        <p className="text-xs text-slate-500 mb-4">This grid visualizes how your stacks will be numbered on the floor.</p>
        <div 
          className="inline-grid gap-1 bg-slate-200 p-1 rounded-md max-w-full overflow-x-auto"
          style={{ gridTemplateColumns: `repeat(${formData.gridCols}, minmax(40px, 1fr))` }}
        >
          {gridCells.map((row, rIdx) => 
            row.map((cell, cIdx) => (
              <div 
                key={`${rIdx}-${cIdx}`}
                className={`h-10 w-10 flex items-center justify-center text-xs font-semibold rounded select-none ${cell !== null ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-300'}`}
              >
                {cell !== null ? cell : '-'}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 border rounded-lg bg-slate-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-lg">{isEdit ? t('warehouses.editWarehouse') || 'Edit Cold Warehouse' : t('warehouses.addNewWarehouse')}</h3>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel Edit
          </Button>
        )}
      </div>
      
      {isEdit && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm mb-4">
          <strong>Note:</strong> Structural details (Chambers, Floors, Stacks, Layout) cannot be changed after creation to prevent data corruption.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.warehouseName')}</label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder={t('warehouses.warehouseNamePlaceholder')}
          />
        </div>
        {isEdit && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Warehouse ID</label>
            <Input 
              value={formData.warehouseId} 
              onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })} 
              placeholder="e.g. CWH-1234"
            />
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.fullAddress')}</label>
          <Input 
            required 
            value={formData.address} 
            onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
            placeholder={t('warehouses.fullAddress')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Warehouse Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith('image/')) {
                toast.error('Please upload a valid image file.');
                return;
              }
              if (file.size > 500 * 1024) {
                toast.error('Logo file size must be 500KB or smaller.');
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                  setWarehouseLogo(result);
                  setLogoPreview(result);
                }
              };
              reader.readAsDataURL(file);
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
          />
          {logoPreview && (
            <div className="mt-2 h-16 w-32 overflow-hidden rounded-md border bg-slate-50">
              <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Aadhaar Card No.</label>
          <Input 
            value={aadhaarNo} 
            onChange={(e) => setAadhaarNo(e.target.value)} 
            placeholder="Aadhaar Number"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">PAN No.</label>
          <Input 
            value={panNo} 
            onChange={(e) => setPanNo(e.target.value)} 
            placeholder="PAN Number"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">GSTIN</label>
          <Input 
            value={gstin} 
            onChange={(e) => setGstin(e.target.value)} 
            placeholder="GSTIN"
          />
        </div>
      </div>

      <div className="border-b pb-6">
        <h4 className="font-medium text-sm mb-4 text-slate-700">Bank Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Bank Name</label>
            <Input 
              value={bankDetails.bankName} 
              onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })} 
              placeholder="Bank Name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Account No.</label>
            <Input 
              value={bankDetails.accountNo} 
              onChange={(e) => setBankDetails({ ...bankDetails, accountNo: e.target.value })} 
              placeholder="Account Number"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">IFSC Code</label>
            <Input 
              value={bankDetails.ifsc} 
              onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value })} 
              placeholder="IFSC Code"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Branch</label>
            <Input 
              value={bankDetails.branch} 
              onChange={(e) => setBankDetails({ ...bankDetails, branch: e.target.value })} 
              placeholder="Branch Name"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.noOfChambers')}</label>
          <ColdNumberInput 
            required 
            min="1"
            disabled={isEdit}
            value={formData.noOfChambers} 
            onChange={(val) => setFormData({ ...formData, noOfChambers: parseInt(val) || 0 })} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.noOfFloorsPerChamber')}</label>
          <ColdNumberInput 
            required 
            min="1"
            disabled={isEdit}
            value={formData.noOfFloors} 
            onChange={(val) => setFormData({ ...formData, noOfFloors: parseInt(val) || 0 })} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.noOfStacksPerFloor')}</label>
          <ColdNumberInput 
            required 
            min="1"
            disabled={isEdit}
            value={formData.noOfStacks} 
            onChange={(val) => setFormData({ ...formData, noOfStacks: parseInt(val) || 0 })} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('warehouses.stackCapacityReq')}</label>
          <ColdNumberInput 
            required 
            min="1"
            disabled={isEdit}
            value={formData.stackCapacity} 
            onChange={(val) => setFormData({ ...formData, stackCapacity: parseInt(val) || 0 })} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Buffer Capacity (Kg)</label>
          <ColdNumberInput 
            required 
            min="0"
            value={formData.bufferCapacity} 
            onChange={(val) => setFormData({ ...formData, bufferCapacity: parseInt(val) || 0 })} 
          />
        </div>
      </div>
      <div className="border-t pt-4">
        <div className="flex items-center space-x-2 mb-4">
          <input 
            type="checkbox" 
            id="customNames" 
            checked={useCustomNames} 
            onChange={(e) => setUseCustomNames(e.target.checked)} 
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="customNames" className="text-sm font-medium text-slate-700 cursor-pointer">
            Use Custom Names for Chambers and Floors
          </label>
        </div>
      </div>

      {useCustomNames && (
        <>
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm mb-4 text-slate-700">Chamber Names</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: formData.noOfChambers }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <label className="text-sm font-medium">Chamber {i + 1} Name</label>
                  <Input 
                    value={chamberNames[i] || ''} 
                    onChange={(e) => {
                      const newNames = [...chamberNames];
                      newNames[i] = e.target.value;
                      setChamberNames(newNames);
                    }} 
                    placeholder={`e.g. Chamber ${i + 1} or Main Chamber`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm mb-4 text-slate-700">Floor Names</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: formData.noOfFloors }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <label className="text-sm font-medium">Floor {i + 1} Name</label>
                  <Input 
                    value={floorNames[i] || ''} 
                    onChange={(e) => {
                      const newNames = [...floorNames];
                      newNames[i] = e.target.value;
                      setFloorNames(newNames);
                    }} 
                    placeholder={`e.g. Ground, F1, Basement`}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="border-t pt-4">
        <h4 className="font-medium text-sm mb-4 text-slate-700">Stack Layout Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Layout Type</label>
            <Select 
              disabled={isEdit}
              value={formData.stackLayout} 
              onValueChange={(val) => setFormData({ ...formData, stackLayout: val })}
            >
              <SelectTrigger><SelectValue placeholder="Select Layout" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ROW_WISE">Row Wise</SelectItem>
                <SelectItem value="COLUMN_WISE">Column Wise</SelectItem>
                <SelectItem value="REVERSE_ROW_WISE">Reverse Row Wise</SelectItem>
                <SelectItem value="REVERSE_COLUMN_WISE">Reverse Column Wise</SelectItem>
                <SelectItem value="CUSTOM">Custom Mapping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Grid Rows</label>
            <ColdNumberInput 
              required
              min="1"
              disabled={isEdit}
              value={formData.gridRows} 
              onChange={(val) => setFormData({ ...formData, gridRows: parseInt(val) || 0 })} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Grid Columns</label>
            <ColdNumberInput 
              required
              min="1"
              disabled={isEdit}
              value={formData.gridCols} 
              onChange={(val) => setFormData({ ...formData, gridCols: parseInt(val) || 0 })} 
            />
          </div>
        </div>

        {formData.stackLayout === 'CUSTOM' && formData.gridRows > 0 && formData.gridCols > 0 && (
          <div className="mt-4 p-4 bg-white border rounded-md">
            <h5 className="text-sm font-medium mb-2">Custom Grid Mapping</h5>
            <p className="text-xs text-slate-500 mb-4">Click on a grid cell to assign the next available stack number, or double-click to remove.</p>
            <div 
              className="inline-grid gap-1 bg-slate-200 p-1 rounded-md"
              style={{ gridTemplateColumns: `repeat(${formData.gridCols}, minmax(40px, 1fr))` }}
            >
              {Array.from({ length: formData.gridRows }).map((_, rIdx) => 
                Array.from({ length: formData.gridCols }).map((_, cIdx) => {
                  const mapped = customLayout.find(c => c.rowIndex === rIdx && c.colIndex === cIdx);
                  return (
                    <div 
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => {
                        if (isEdit) return; // Prevent changing layout if editing
                        if (!mapped && customLayout.length < formData.noOfStacks) {
                          // Find next unassigned stack No
                          const assigned = customLayout.map(c => c.stackNo);
                          let nextStack = 1;
                          while(assigned.includes(nextStack)) nextStack++;
                          if (nextStack <= formData.noOfStacks) {
                            setCustomLayout([...customLayout, { rowIndex: rIdx, colIndex: cIdx, stackNo: nextStack }]);
                          }
                        }
                      }}
                      onDoubleClick={() => {
                        if (mapped) {
                          setCustomLayout(customLayout.filter(c => !(c.rowIndex === rIdx && c.colIndex === cIdx)));
                        }
                      }}
                      className={`h-10 w-10 flex items-center justify-center text-xs font-semibold rounded cursor-pointer select-none transition-colors ${mapped ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' : 'bg-white text-slate-400 hover:bg-slate-100'}`}
                    >
                      {mapped ? mapped.stackNo : '-'}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {renderLivePreview()}
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium">{t('warehouses.referencePersons')}</label>
          <Button type="button" variant="outline" size="sm" onClick={addReferencePerson}>
            <Plus className="h-4 w-4 mr-2" /> {t('warehouses.addPerson')}
          </Button>
        </div>
        
        {referencePersons.map((rp: any, index: number) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-start bg-white p-3 rounded border">
            <div className="space-y-1">
              <Input 
                placeholder={`${t('warehouses.name')} *`}
                required 
                value={rp.name} 
                onChange={(e) => updateReferencePerson(index, 'name', e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <Input 
                placeholder={t('warehouses.mobile')}
                value={rp.mobile} 
                onChange={(e) => updateReferencePerson(index, 'mobile', e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <Input 
                type="email"
                placeholder={t('warehouses.email')}
                value={rp.email} 
                onChange={(e) => updateReferencePerson(index, 'email', e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <Input 
                placeholder={t('warehouses.designation')}
                value={rp.designation} 
                onChange={(e) => updateReferencePerson(index, 'designation', e.target.value)} 
              />
            </div>
            <div className="flex justify-end h-full items-center">
              {referencePersons.length > 1 && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => removeReferencePerson(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={loading} className="w-full md:w-auto">
          {loading ? t('warehouses.saving') : isEdit ? t('warehouses.updateWarehouse') || 'Update Warehouse' : t('warehouses.saveWarehouse')}
        </Button>
      </div>
    </form>
  );
}
