'use client';

import { useState, useEffect } from 'react';
import { createColdWarehouse, updateColdWarehouse } from '@/app/actions/cold-warehouse-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { toast } from 'react-hot-toast';
import { Trash2, Plus, Layers, Hash, CheckCircle, Tag, Grid, Weight } from 'lucide-react';
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

  // Dynamic Hierarchy Configuration State
  const [sameFloorsPerChamber, setSameFloorsPerChamber] = useState<boolean>(
    initialData?.sameFloorsPerChamber ?? true
  );
  const [chamberFloorsConfig, setChamberFloorsConfig] = useState<number[]>(
    initialData?.chamberFloorsConfig?.length
      ? initialData.chamberFloorsConfig
      : Array(initialData?.noOfChambers || 1).fill(initialData?.noOfFloors || 1)
  );

  const [sameStacksPerFloor, setSameStacksPerFloor] = useState<boolean>(
    initialData?.sameStacksPerFloor ?? true
  );
  const [floorStacksConfig, setFloorStacksConfig] = useState<Record<string, number>>(
    initialData?.floorStacksConfig || {}
  );

  const [stackNumberingOption, setStackNumberingOption] = useState<'RESTART_PER_FLOOR' | 'CONTINUE_ACROSS_FLOORS'>(
    initialData?.stackNumberingOption || 'RESTART_PER_FLOOR'
  );

  // Custom Naming State
  const [useCustomNames, setUseCustomNames] = useState<boolean>(true);
  const [chamberCustomNames, setChamberCustomNames] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    if (initialData?.chambers) {
      initialData.chambers.forEach((c: any, idx: number) => {
        map[idx + 1] = c.name || '';
      });
    }
    return map;
  });

  const [floorCustomNames, setFloorCustomNames] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialData?.chambers) {
      initialData.chambers.forEach((c: any, cIdx: number) => {
        if (c.floors) {
          c.floors.forEach((f: any, fIdx: number) => {
            map[`${cIdx + 1}-${fIdx + 1}`] = f.name || '';
          });
        }
      });
    }
    return map;
  });

  // Per-Floor Layout Configuration State
  const [floorLayoutConfig, setFloorLayoutConfig] = useState<Record<string, {
    stackLayout: string;
    gridRows: number;
    gridCols: number;
    customLayout?: { rowIndex: number; colIndex: number; stackNo: number }[];
  }>>(() => {
    const initialConfig: Record<string, any> = {};
    if (initialData?.chambers) {
      initialData.chambers.forEach((c: any, cIdx: number) => {
        if (c.floors) {
          c.floors.forEach((f: any, fIdx: number) => {
            const key = `${cIdx + 1}-${fIdx + 1}`;
            const stacksCount = f.stacks?.length || 1;
            const defaultRows = f.gridRows || Math.ceil(Math.sqrt(stacksCount));
            const defaultCols = f.gridCols || Math.ceil(stacksCount / defaultRows);
            initialConfig[key] = {
              stackLayout: f.stackLayout || initialData.stackLayout || 'ROW_WISE',
              gridRows: defaultRows,
              gridCols: defaultCols,
              customLayout: f.customLayout || []
            };
          });
        }
      });
    }
    return initialConfig;
  });

  // Custom Stack Capacity Overrides State
  const [customStackCapacities, setCustomStackCapacities] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (initialData?.customStackCapacities) {
      Object.assign(map, initialData.customStackCapacities);
    } else if (initialData?.chambers) {
      initialData.chambers.forEach((c: any, cIdx: number) => {
        c.floors?.forEach((f: any, fIdx: number) => {
          f.stacks?.forEach((s: any) => {
            if (s.capacity && s.capacity !== initialData.stackCapacity) {
              map[`${cIdx + 1}-${fIdx + 1}-${s.stackNo}`] = s.capacity;
            }
          });
        });
      });
    }
    return map;
  });

  // Form controls state for adding a custom stack capacity override
  const [overrideChamber, setOverrideChamber] = useState<number>(1);
  const [overrideFloor, setOverrideFloor] = useState<number>(1);
  const [overrideStackNo, setOverrideStackNo] = useState<number>(1);
  const [overrideCapacity, setOverrideCapacity] = useState<number>(1000);

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

  // Sync chamberFloorsConfig array when noOfChambers changes
  useEffect(() => {
    if (!isEdit) {
      setChamberFloorsConfig((prev) => {
        const next = [...prev];
        if (formData.noOfChambers > next.length) {
          next.push(...Array(formData.noOfChambers - next.length).fill(formData.noOfFloors || 1));
        } else if (formData.noOfChambers < next.length) {
          next.length = formData.noOfChambers;
        }
        return next;
      });
    }
  }, [formData.noOfChambers, formData.noOfFloors, isEdit]);

  // Helper to get floor count for chamber c (1-indexed)
  const getFloorCountForChamber = (c: number) => {
    if (sameFloorsPerChamber) return formData.noOfFloors || 1;
    return chamberFloorsConfig[c - 1] || 1;
  };

  // Helper to get stack count for chamber c, floor f (1-indexed)
  const getStackCountForFloor = (c: number, f: number) => {
    if (sameStacksPerFloor) return formData.noOfStacks || 1;
    const key = `${c}-${f}`;
    return floorStacksConfig[key] || formData.noOfStacks || 1;
  };

  // Helper to get layout configuration for chamber c, floor f (1-indexed)
  const getFloorLayout = (c: number, f: number) => {
    const key = `${c}-${f}`;
    const stacksCount = getStackCountForFloor(c, f);
    const defaultRows = Math.ceil(Math.sqrt(stacksCount));
    const defaultCols = Math.ceil(stacksCount / defaultRows);
    
    if (!floorLayoutConfig[key]) {
      return {
        stackLayout: 'ROW_WISE',
        gridRows: defaultRows,
        gridCols: defaultCols,
        customLayout: []
      };
    }
    return floorLayoutConfig[key];
  };

  const updateFloorLayout = (c: number, f: number, fields: Partial<{ stackLayout: string, gridRows: number, gridCols: number, customLayout: any[] }>) => {
    const key = `${c}-${f}`;
    const current = getFloorLayout(c, f);
    setFloorLayoutConfig(prev => ({
      ...prev,
      [key]: {
        ...current,
        ...fields
      }
    }));
  };

  // Calculate total stacks count across all chambers and floors
  const getTotalStacksCount = () => {
    let total = 0;
    for (let c = 1; c <= formData.noOfChambers; c++) {
      const floorsCount = getFloorCountForChamber(c);
      for (let f = 1; f <= floorsCount; f++) {
        total += getStackCountForFloor(c, f);
      }
    }
    return total;
  };

  // Calculate calculated total warehouse capacity considering default stack capacity & individual overrides
  const getCalculatedTotalCapacity = () => {
    let total = 0;
    for (let c = 1; c <= formData.noOfChambers; c++) {
      const floorsCount = getFloorCountForChamber(c);
      for (let f = 1; f <= floorsCount; f++) {
        const stacksCount = getStackCountForFloor(c, f);
        for (let s = 1; s <= stacksCount; s++) {
          const key = `${c}-${f}-${s}`;
          const customCap = customStackCapacities[key];
          const cap = customCap !== undefined && customCap > 0 ? customCap : (formData.stackCapacity || 0);
          total += cap;
        }
      }
    }
    return total;
  };

  const addCapacityOverride = () => {
    if (overrideCapacity <= 0) {
      toast.error('Override capacity must be a positive number');
      return;
    }
    const key = `${overrideChamber}-${overrideFloor}-${overrideStackNo}`;
    setCustomStackCapacities(prev => ({
      ...prev,
      [key]: overrideCapacity
    }));
    toast.success(`Capacity for Chamber ${chamberCustomNames[overrideChamber] || overrideChamber} → Floor ${floorCustomNames[`${overrideChamber}-${overrideFloor}`] || overrideFloor} → Stack ${overrideStackNo} set to ${overrideCapacity} KG`);
  };

  const removeCapacityOverride = (key: string) => {
    setCustomStackCapacities(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.noOfChambers < 1) {
        toast.error('Number of Chambers must be at least 1');
        setLoading(false);
        return;
      }

      if (formData.stackCapacity < 1) {
        toast.error('Stack Capacity must be a positive number');
        setLoading(false);
        return;
      }

      if (sameFloorsPerChamber && formData.noOfFloors < 1) {
        toast.error('Number of Floors must be at least 1');
        setLoading(false);
        return;
      }

      if (sameStacksPerFloor && formData.noOfStacks < 1) {
        toast.error('Number of Stacks per Floor must be at least 1');
        setLoading(false);
        return;
      }

      // Validate per-floor grid dimensions & layout
      for (let c = 1; c <= formData.noOfChambers; c++) {
        const floorsCount = getFloorCountForChamber(c);
        for (let f = 1; f <= floorsCount; f++) {
          const layout = getFloorLayout(c, f);
          const stacksCount = getStackCountForFloor(c, f);
          const cName = chamberCustomNames[c] || `Chamber ${c}`;
          const fName = floorCustomNames[`${c}-${f}`] || `Floor ${f}`;

          if (['ROW_WISE', 'COLUMN_WISE', 'REVERSE_ROW_WISE', 'REVERSE_COLUMN_WISE', 'CUSTOM'].includes(layout.stackLayout)) {
            if (!layout.gridRows || !layout.gridCols || layout.gridRows * layout.gridCols < stacksCount) {
              toast.error(`${cName} → ${fName}: Grid dimensions (${layout.gridRows}x${layout.gridCols} = ${layout.gridRows * layout.gridCols}) must be at least ${stacksCount} to fit all stacks on this floor.`);
              setLoading(false);
              return;
            }
          }

          if (layout.stackLayout === 'CUSTOM' && (layout.customLayout?.length || 0) !== stacksCount) {
            toast.error(`${cName} → ${fName}: Please map all ${stacksCount} stacks in the custom layout.`);
            setLoading(false);
            return;
          }
        }
      }

      // Build prepared floor layout config
      const preparedFloorLayoutConfig: Record<string, any> = {};
      for (let c = 1; c <= formData.noOfChambers; c++) {
        const floorsCount = getFloorCountForChamber(c);
        for (let f = 1; f <= floorsCount; f++) {
          const key = `${c}-${f}`;
          preparedFloorLayoutConfig[key] = getFloorLayout(c, f);
        }
      }

      const payload = {
        ...formData,
        sameFloorsPerChamber,
        chamberFloorsConfig: sameFloorsPerChamber ? undefined : chamberFloorsConfig,
        sameStacksPerFloor,
        floorStacksConfig: sameStacksPerFloor ? undefined : floorStacksConfig,
        stackNumberingOption,
        chamberCustomNames,
        floorCustomNames,
        floorLayoutConfig: preparedFloorLayoutConfig,
        customStackCapacities,
        warehouseId: formData.warehouseId,
        referencePersons: referencePersons.filter((rp: any) => rp.name.trim() !== ''),
        aadhaarNo,
        panNo,
        gstin,
        bankDetails,
        warehouseLogo,
        chambers: isEdit ? initialData.chambers.map((c: any, cIdx: number) => ({
          ...c,
          name: chamberCustomNames[cIdx + 1] && chamberCustomNames[cIdx + 1].trim() !== '' ? chamberCustomNames[cIdx + 1].trim() : `Chamber ${cIdx + 1}`,
          floors: c.floors?.map((f: any, fIdx: number) => {
            const fLayout = getFloorLayout(cIdx + 1, fIdx + 1);
            return {
              ...f,
              name: floorCustomNames[`${cIdx + 1}-${fIdx + 1}`] && floorCustomNames[`${cIdx + 1}-${fIdx + 1}`].trim() !== '' ? floorCustomNames[`${cIdx + 1}-${fIdx + 1}`].trim() : `Floor ${fIdx + 1}`,
              stackLayout: fLayout.stackLayout,
              gridRows: fLayout.gridRows,
              gridCols: fLayout.gridCols,
              customLayout: fLayout.customLayout
            };
          })
        })) : undefined,
      };

      let res;
      if (isEdit) {
        res = await updateColdWarehouse(initialData._id, payload);
      } else {
        res = await createColdWarehouse(payload);
      }

      if (res.success) {
        toast.success(isEdit ? t('warehouses.warehouseUpdated') || 'Warehouse updated successfully' : t('warehouses.warehouseCreated') || 'Warehouse created successfully');
        onSuccess();
      } else {
        toast.error(res.error || (isEdit ? 'Failed to update warehouse' : t('warehouses.warehouseCreationFailed')));
      }
    } catch (err) {
      toast.error(t('warehouses.somethingWentWrong') || 'Something went wrong');
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

  // Render individual live layout preview for chamber c, floor f
  const renderFloorLivePreview = (c: number, f: number) => {
    const layout = getFloorLayout(c, f);
    const stacksCount = getStackCountForFloor(c, f);
    const rows = layout.gridRows || 1;
    const cols = layout.gridCols || 1;

    if (layout.stackLayout === 'CUSTOM' || rows <= 0 || cols <= 0) return null;

    let gridCells: (number | null)[][] = Array.from({ length: rows }).map(() => Array(cols).fill(null));
    let sNo = 1;

    if (layout.stackLayout === 'ROW_WISE') {
      for (let r = 0; r < rows; r++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          if (sNo <= stacksCount) gridCells[r][cIdx] = sNo++;
        }
      }
    } else if (layout.stackLayout === 'REVERSE_ROW_WISE') {
      for (let r = 0; r < rows; r++) {
        for (let cIdx = cols - 1; cIdx >= 0; cIdx--) {
          if (sNo <= stacksCount) gridCells[r][cIdx] = sNo++;
        }
      }
    } else if (layout.stackLayout === 'COLUMN_WISE') {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        for (let r = 0; r < rows; r++) {
          if (sNo <= stacksCount) gridCells[r][cIdx] = sNo++;
        }
      }
    } else if (layout.stackLayout === 'REVERSE_COLUMN_WISE') {
      for (let cIdx = cols - 1; cIdx >= 0; cIdx--) {
        for (let r = 0; r < rows; r++) {
          if (sNo <= stacksCount) gridCells[r][cIdx] = sNo++;
        }
      }
    }

    return (
      <div className="mt-3 p-3 bg-slate-100 border border-slate-200 rounded-md">
        <div className="flex justify-between items-center mb-2">
          <h6 className="text-xs font-semibold text-indigo-700">Live Layout Preview ({layout.stackLayout.replace(/_/g, ' ')})</h6>
          <span className="text-[11px] text-slate-500 font-mono">{rows} rows × {cols} cols ({stacksCount} stacks)</span>
        </div>
        <div 
          className="inline-grid gap-1 bg-slate-200 p-1 rounded-md max-w-full overflow-x-auto"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(36px, 1fr))` }}
        >
          {gridCells.map((row, rIdx) => 
            row.map((cell, cIdx) => {
              const capKey = `${c}-${f}-${cell}`;
              const customCap = cell !== null ? customStackCapacities[capKey] : undefined;
              const hasCustomCap = customCap !== undefined && customCap > 0;

              return (
                <div 
                  key={`${rIdx}-${cIdx}`}
                  title={cell !== null ? `Stack ${cell}: ${hasCustomCap ? customCap : formData.stackCapacity} KG` : ''}
                  className={`h-8 w-8 flex items-center justify-center text-[10px] font-semibold rounded select-none relative ${cell !== null ? (hasCustomCap ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400' : 'bg-indigo-600 text-white shadow-sm') : 'bg-slate-100 text-slate-300'}`}
                >
                  {cell !== null ? cell : '-'}
                  {hasCustomCap && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  )}
                </div>
              );
            })
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

      {/* Basic Warehouse Info */}
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

      {/* Bank Details */}
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

      {/* Chamber -> Floor -> Stack Hierarchy Configuration */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <h4 className="font-semibold text-base text-indigo-900 border-b pb-2 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          Warehouse Structure Configuration (Chamber → Floor → Stack)
        </h4>

        {/* 1. Chambers Field */}
        <div className="space-y-2 max-w-xs">
          <label className="text-sm font-semibold text-slate-700">{t('warehouses.noOfChambers') || 'No. of Chambers *'}</label>
          <ColdNumberInput 
            required 
            min="1"
            disabled={isEdit}
            value={formData.noOfChambers} 
            onChange={(val) => setFormData({ ...formData, noOfChambers: Math.max(1, parseInt(val) || 1) })} 
          />
        </div>

        {/* 2. Floor Configuration */}
        <div className="space-y-3 border-t pt-4">
          <label className="text-sm font-semibold text-slate-800 block">
            {t('warehouses.areFloorsSame') || 'Are floors the same for every chamber?'}
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setSameFloorsPerChamber(true)}
              className={`flex-1 py-2.5 px-4 rounded-md border text-sm font-medium transition-all ${
                sameFloorsPerChamber 
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Yes (Same floors for all chambers)
            </button>
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setSameFloorsPerChamber(false)}
              className={`flex-1 py-2.5 px-4 rounded-md border text-sm font-medium transition-all ${
                !sameFloorsPerChamber 
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              No (Different floors per chamber)
            </button>
          </div>

          {sameFloorsPerChamber ? (
            <div className="mt-3 max-w-xs space-y-2">
              <label className="text-sm font-medium">{t('warehouses.noOfFloorsPerChamber') || 'No. of Floors *'}</label>
              <ColdNumberInput 
                required 
                min="1"
                disabled={isEdit}
                value={formData.noOfFloors} 
                onChange={(val) => setFormData({ ...formData, noOfFloors: Math.max(1, parseInt(val) || 1) })} 
              />
            </div>
          ) : (
            <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <p className="text-xs text-slate-500 font-medium">Enter number of floors for each chamber:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Array.from({ length: formData.noOfChambers }).map((_, cIdx) => (
                  <div key={cIdx} className="space-y-1 bg-white p-3 rounded border">
                    <label className="text-xs font-semibold text-slate-700">
                      {chamberCustomNames[cIdx + 1] ? chamberCustomNames[cIdx + 1] : `Chamber ${cIdx + 1}`} → No. of Floors
                    </label>
                    <ColdNumberInput 
                      required 
                      min="1"
                      disabled={isEdit}
                      value={chamberFloorsConfig[cIdx] || 1} 
                      onChange={(val) => {
                        const newConfig = [...chamberFloorsConfig];
                        newConfig[cIdx] = Math.max(1, parseInt(val) || 1);
                        setChamberFloorsConfig(newConfig);
                      }} 
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Stack Configuration */}
        <div className="space-y-3 border-t pt-4">
          <label className="text-sm font-semibold text-slate-800 block">
            {t('warehouses.areStacksSame') || 'Are stacks the same for every floor?'}
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setSameStacksPerFloor(true)}
              className={`flex-1 py-2.5 px-4 rounded-md border text-sm font-medium transition-all ${
                sameStacksPerFloor 
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Yes (Same stack count on every floor)
            </button>
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setSameStacksPerFloor(false)}
              className={`flex-1 py-2.5 px-4 rounded-md border text-sm font-medium transition-all ${
                !sameStacksPerFloor 
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              No (Different stack count per floor)
            </button>
          </div>

          {sameStacksPerFloor ? (
            <div className="mt-3 max-w-xs space-y-2">
              <label className="text-sm font-medium">{t('warehouses.noOfStacksPerFloor') || 'No. of Stacks per Floor *'}</label>
              <ColdNumberInput 
                required 
                min="1"
                disabled={isEdit}
                value={formData.noOfStacks} 
                onChange={(val) => setFormData({ ...formData, noOfStacks: Math.max(1, parseInt(val) || 1) })} 
              />
            </div>
          ) : (
            <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
              <p className="text-xs text-slate-500 font-medium">Enter stack count for each floor:</p>
              {Array.from({ length: formData.noOfChambers }).map((_, cIdx) => {
                const cNo = cIdx + 1;
                const floorsCount = getFloorCountForChamber(cNo);
                const cName = chamberCustomNames[cNo] || `Chamber ${cNo}`;

                return (
                  <div key={cNo} className="bg-white p-3 rounded border space-y-2">
                    <h6 className="text-xs font-bold text-indigo-800 uppercase tracking-wide">{cName}</h6>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {Array.from({ length: floorsCount }).map((_, fIdx) => {
                        const fNo = fIdx + 1;
                        const key = `${cNo}-${fNo}`;
                        const currentVal = floorStacksConfig[key] || formData.noOfStacks || 1;
                        const fName = floorCustomNames[key] || `Floor ${fNo}`;

                        return (
                          <div key={fNo} className="space-y-1 bg-slate-50 p-2.5 rounded border">
                            <label className="text-xs font-medium text-slate-600">
                              {cName} → {fName} Stacks
                            </label>
                            <ColdNumberInput 
                              required 
                              min="1"
                              disabled={isEdit}
                              value={currentVal} 
                              onChange={(val) => {
                                setFloorStacksConfig(prev => ({
                                  ...prev,
                                  [key]: Math.max(1, parseInt(val) || 1)
                                }));
                              }} 
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Stack Numbering Options */}
        <div className="space-y-3 border-t pt-4">
          <label className="text-sm font-semibold text-slate-800 block flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-600" />
            {t('warehouses.stackNumbering') || 'Stack Numbering'}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              onClick={() => !isEdit && setStackNumberingOption('RESTART_PER_FLOOR')}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                stackNumberingOption === 'RESTART_PER_FLOOR' 
                  ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20' 
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-slate-900">{t('warehouses.restartOnEachFloor') || 'Restart on each floor'}</span>
                {stackNumberingOption === 'RESTART_PER_FLOOR' && <CheckCircle className="w-4 h-4 text-indigo-600" />}
              </div>
              <p className="text-xs text-slate-500">Numbering resets to Stack 1 on every floor.</p>
              <div className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-100 p-1.5 rounded">
                Floor 1: Stack 1–50 | Floor 2: Stack 1–50
              </div>
            </div>

            <div 
              onClick={() => !isEdit && setStackNumberingOption('CONTINUE_ACROSS_FLOORS')}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                stackNumberingOption === 'CONTINUE_ACROSS_FLOORS' 
                  ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20' 
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-slate-900">{t('warehouses.continueAcrossFloors') || 'Continue numbering across floors'}</span>
                {stackNumberingOption === 'CONTINUE_ACROSS_FLOORS' && <CheckCircle className="w-4 h-4 text-indigo-600" />}
              </div>
              <p className="text-xs text-slate-500">Numbering continues sequentially from the previous floor's last stack.</p>
              <div className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-100 p-1.5 rounded">
                Floor 1: Stack 1–50 | Floor 2: Stack 51–100
              </div>
            </div>
          </div>
        </div>

        {/* 5. Stack Capacity & Buffer Capacity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('warehouses.stackCapacityReq') || 'Default Per Stack Capacity (Kg) *'}</label>
            <ColdNumberInput 
              required 
              min="1"
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

        {/* Structure Summary Banner */}
        <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-md text-xs text-indigo-950 flex flex-wrap gap-x-6 gap-y-1">
          <span><strong>Total Chambers:</strong> {formData.noOfChambers}</span>
          <span><strong>Total Stacks:</strong> {getTotalStacksCount()}</span>
          <span><strong>Calculated Total Capacity:</strong> {getCalculatedTotalCapacity().toLocaleString()} Kg</span>
        </div>
      </div>

      {/* Customize Individual Stack Capacity (Optional) */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-semibold text-base text-slate-800 flex items-center gap-2 border-b pb-2">
          <Weight className="w-5 h-5 text-amber-600" />
          Customize Stack Capacity (Optional)
        </h4>

        <p className="text-xs text-slate-500">
          Specify custom capacity for individual stacks if they differ from the default capacity ({formData.stackCapacity.toLocaleString()} KG). Unspecified stacks keep the default floor capacity.
        </p>

        {/* Form controls to add override */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-slate-50 p-3 rounded-lg border">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Chamber</label>
            <Select 
              value={overrideChamber.toString()} 
              onValueChange={(val) => {
                const cVal = Number(val);
                setOverrideChamber(cVal);
                setOverrideFloor(1);
                setOverrideStackNo(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Chamber" /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: formData.noOfChambers }).map((_, cIdx) => (
                  <SelectItem key={cIdx + 1} value={(cIdx + 1).toString()}>
                    {chamberCustomNames[cIdx + 1] || `Chamber ${cIdx + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Floor</label>
            <Select 
              value={overrideFloor.toString()} 
              onValueChange={(val) => {
                setOverrideFloor(Number(val));
                setOverrideStackNo(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Floor" /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: getFloorCountForChamber(overrideChamber) }).map((_, fIdx) => (
                  <SelectItem key={fIdx + 1} value={(fIdx + 1).toString()}>
                    {floorCustomNames[`${overrideChamber}-${fIdx + 1}`] || `Floor ${fIdx + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Stack No.</label>
            <ColdNumberInput 
              min="1"
              max={getStackCountForFloor(overrideChamber, overrideFloor)}
              value={overrideStackNo}
              onChange={(val) => setOverrideStackNo(Math.max(1, parseInt(val) || 1))}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Custom Cap (KG)</label>
            <ColdNumberInput 
              min="1"
              value={overrideCapacity}
              onChange={(val) => setOverrideCapacity(parseInt(val) || 0)}
              className="h-9 text-xs"
            />
          </div>

          <div>
            <Button 
              type="button" 
              onClick={addCapacityOverride} 
              size="sm"
              className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Capacity
            </Button>
          </div>
        </div>

        {/* Overrides Table */}
        {Object.keys(customStackCapacities).length > 0 && (
          <div className="mt-3 space-y-2">
            <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Active Stack Capacity Overrides</h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(customStackCapacities).map(([key, cap]) => {
                const [c, f, s] = key.split('-');
                const cName = chamberCustomNames[Number(c)] || `Chamber ${c}`;
                const fName = floorCustomNames[`${c}-${f}`] || `Floor ${f}`;

                return (
                  <div key={key} className="flex justify-between items-center p-2 bg-amber-50 border border-amber-200 rounded-md text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">{cName} → {fName} → Stack {s}</span>
                      <div className="font-mono text-amber-900 font-bold">{cap.toLocaleString()} KG</div>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeCapacityOverride(key)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Custom Names Section for Chambers and Floors */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h4 className="font-semibold text-base text-slate-800 flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600" />
            Custom Chamber & Floor Names / Numbers (Optional)
          </h4>
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="customNames" 
              checked={useCustomNames} 
              onChange={(e) => setUseCustomNames(e.target.checked)} 
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="customNames" className="text-xs font-medium text-slate-700 cursor-pointer">
              Enable Custom Names
            </label>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Enter custom names/numbers for each chamber and floor (e.g. Chamber "A", Floor "Ground", "First"). If left blank, automatic defaults (Chamber 1, Floor 1) are kept.
        </p>

        {useCustomNames && (
          <div className="space-y-4 pt-2">
            {Array.from({ length: formData.noOfChambers }).map((_, cIdx) => {
              const cNo = cIdx + 1;
              const floorsCount = getFloorCountForChamber(cNo);

              return (
                <div key={cNo} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center border-b pb-2">
                    <label className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                      Chamber {cNo} Name / Number
                    </label>
                    <Input 
                      value={chamberCustomNames[cNo] || ''} 
                      onChange={(e) => {
                        setChamberCustomNames(prev => ({
                          ...prev,
                          [cNo]: e.target.value
                        }));
                      }} 
                      placeholder={`e.g. A, B, or Chamber ${cNo}`}
                      className="bg-white text-sm"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-semibold text-slate-600 block">
                      Floors in {chamberCustomNames[cNo] || `Chamber ${cNo}`}:
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {Array.from({ length: floorsCount }).map((_, fIdx) => {
                        const fNo = fIdx + 1;
                        const key = `${cNo}-${fNo}`;

                        return (
                          <div key={fNo} className="space-y-1 bg-white p-2.5 rounded border">
                            <label className="text-[11px] font-medium text-slate-500 block">
                              Floor {fNo} Name / Number
                            </label>
                            <Input 
                              value={floorCustomNames[key] || ''} 
                              onChange={(e) => {
                                setFloorCustomNames(prev => ({
                                  ...prev,
                                  [key]: e.target.value
                                }));
                              }} 
                              placeholder={`e.g. Ground, First, or Floor ${fNo}`}
                              className="text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-Floor Stack Layout Configuration */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <h4 className="font-semibold text-base text-indigo-900 border-b pb-2 flex items-center gap-2">
          <Grid className="w-5 h-5 text-indigo-600" />
          Per-Floor Stack Layout Configuration & Live Previews
        </h4>

        <p className="text-xs text-slate-500">
          Configure Layout Type, Grid Rows, and Grid Columns separately for every floor. Each floor generates its own visual grid layout and preview.
        </p>

        <div className="space-y-6">
          {Array.from({ length: formData.noOfChambers }).map((_, cIdx) => {
            const cNo = cIdx + 1;
            const floorsCount = getFloorCountForChamber(cNo);
            const cName = chamberCustomNames[cNo] || `Chamber ${cNo}`;

            return (
              <div key={cNo} className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-4">
                <h5 className="font-bold text-sm text-indigo-950 uppercase tracking-wide border-b pb-2">
                  {cName} Layout Configurations
                </h5>

                <div className="space-y-6">
                  {Array.from({ length: floorsCount }).map((_, fIdx) => {
                    const fNo = fIdx + 1;
                    const fName = floorCustomNames[`${cNo}-${fNo}`] || `Floor ${fNo}`;
                    const layout = getFloorLayout(cNo, fNo);
                    const stacksCount = getStackCountForFloor(cNo, fNo);

                    return (
                      <div key={fNo} className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
                        <div className="flex justify-between items-center border-b pb-2">
                          <h6 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                            {cName} → {fName} Layout
                          </h6>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {stacksCount} Stacks
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700">Layout Type</label>
                            <Select 
                              disabled={isEdit}
                              value={layout.stackLayout} 
                              onValueChange={(val) => updateFloorLayout(cNo, fNo, { stackLayout: val })}
                            >
                              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Layout" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ROW_WISE">Row Wise</SelectItem>
                                <SelectItem value="COLUMN_WISE">Column Wise</SelectItem>
                                <SelectItem value="REVERSE_ROW_WISE">Reverse Row Wise</SelectItem>
                                <SelectItem value="REVERSE_COLUMN_WISE">Reverse Column Wise</SelectItem>
                                <SelectItem value="CUSTOM">Custom Mapping</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700">Grid Rows</label>
                            <ColdNumberInput 
                              required
                              min="1"
                              disabled={isEdit}
                              className="h-9 text-xs"
                              value={layout.gridRows} 
                              onChange={(val) => updateFloorLayout(cNo, fNo, { gridRows: Math.max(1, parseInt(val) || 1) })} 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700">Grid Columns</label>
                            <ColdNumberInput 
                              required
                              min="1"
                              disabled={isEdit}
                              className="h-9 text-xs"
                              value={layout.gridCols} 
                              onChange={(val) => updateFloorLayout(cNo, fNo, { gridCols: Math.max(1, parseInt(val) || 1) })} 
                            />
                          </div>
                        </div>

                        {/* Custom Grid Mapping Editor if layout is CUSTOM */}
                        {layout.stackLayout === 'CUSTOM' && layout.gridRows > 0 && layout.gridCols > 0 && (
                          <div className="mt-3 p-3 bg-slate-50 border rounded-md">
                            <h6 className="text-xs font-semibold text-slate-800 mb-1">Custom Grid Mapping for {cName} → {fName}</h6>
                            <p className="text-[11px] text-slate-500 mb-3">Click a cell to assign stack number, double-click to remove.</p>
                            <div 
                              className="inline-grid gap-1 bg-slate-200 p-1 rounded-md max-w-full overflow-x-auto"
                              style={{ gridTemplateColumns: `repeat(${layout.gridCols}, minmax(36px, 1fr))` }}
                            >
                              {Array.from({ length: layout.gridRows }).map((_, rIdx) => 
                                Array.from({ length: layout.gridCols }).map((_, colIdx) => {
                                  const customArr = layout.customLayout || [];
                                  const mapped = customArr.find(cItem => cItem.rowIndex === rIdx && cItem.colIndex === colIdx);
                                  return (
                                    <div 
                                      key={`${rIdx}-${colIdx}`}
                                      onClick={() => {
                                        if (isEdit) return;
                                        if (!mapped && customArr.length < stacksCount) {
                                          const assigned = customArr.map(cItem => cItem.stackNo);
                                          let nextStack = 1;
                                          while(assigned.includes(nextStack)) nextStack++;
                                          if (nextStack <= stacksCount) {
                                            updateFloorLayout(cNo, fNo, {
                                              customLayout: [...customArr, { rowIndex: rIdx, colIndex: colIdx, stackNo: nextStack }]
                                            });
                                          }
                                        }
                                      }}
                                      onDoubleClick={() => {
                                        if (mapped) {
                                          updateFloorLayout(cNo, fNo, {
                                            customLayout: customArr.filter(cItem => !(cItem.rowIndex === rIdx && cItem.colIndex === colIdx))
                                          });
                                        }
                                      }}
                                      className={`h-8 w-8 flex items-center justify-center text-[10px] font-semibold rounded cursor-pointer select-none transition-colors ${mapped ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700' : 'bg-white text-slate-400 hover:bg-slate-100'}`}
                                    >
                                      {mapped ? mapped.stackNo : '-'}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* Live Layout Preview for this Floor */}
                        {renderFloorLivePreview(cNo, fNo)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reference Persons */}
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
