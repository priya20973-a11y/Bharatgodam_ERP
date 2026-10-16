'use client';

import { useState, useEffect, useRef } from 'react';
import { createBatchColdOutwards, getAvailableInwardsForClient, resolveQRForColdOutward } from '@/app/actions/cold-outward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Trash2, ChevronDown, QrCode, Loader2, CheckCircle2, AlertCircle, Search, X } from 'lucide-react';
import { getDynamicUnitLabel } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSearchableSelect } from '@/components/ui/multi-searchable-select';
import OutwardQRScannerModal from './outward-qr-scanner-modal';
import StackQRScannerModal from '@/components/features/inward/stack-qr-scanner-modal';
import { parseStackQrString, verifyStackMatch, getUniqueInwardStacks, isSingleStackAllocMatch, InwardStackLocation } from '@/lib/utils/stack-qr-parser';
import { formatChamberName, formatFloorName } from '@/lib/utils/cold-naming';

const formatLocation = (alloc: any, inwardId: string) => {
  const chamber = alloc.chamberName || alloc.chamberNo;
  const floor = alloc.floorName || alloc.floorNo;
  const stack = alloc.stackName || alloc.stackNo;

  if (chamber === undefined && floor === undefined && stack === undefined) {
    console.warn(`[Cold Outward] Missing location data for inward ID: ${inwardId}`, alloc);
    return '-';
  }

  const formatPart = (val: any, prefix: string) => {
    if (val === undefined || val === null || val === 'undefined' || val === '') return '-';
    const strVal = String(val);
    if (prefix && !strVal.toUpperCase().startsWith(prefix)) {
      return `${prefix}${strVal}`;
    }
    return strVal;
  };

  const cStr = (chamber === undefined || chamber === null || chamber === 'undefined' || chamber === '') ? '-' : String(chamber);
  const fStr = formatPart(floor, 'F');
  const sStr = formatPart(stack, 'S');

  if (cStr === '-' && fStr === '-' && sStr === '-') {
    console.warn(`[Cold Outward] Missing location data for inward ID: ${inwardId}`, alloc);
    return '-';
  }

  return `${cStr}/${fStr}/${sStr}`;
};

interface ColdOutwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess: () => void;
  prefillData?: any;
}

export default function ColdOutwardForm({ clients, commodities, warehouses, onSuccess, prefillData }: ColdOutwardFormProps) {
  const { t, formatNumber } = useColdTranslation();
  const [loading, setLoading] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);
  
  const [isCarryOver, setIsCarryOver] = useState(true);
  const [carryOverClientId, setCarryOverClientId] = useState('');

  // QR Scanner State
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isResolvingQr, setIsResolvingQr] = useState(false);

  // Receipt Search State
  const [searchReceiptNo, setSearchReceiptNo] = useState('');
  const [isSearchingReceipt, setIsSearchingReceipt] = useState(false);

  // Lot Search & Dropdown State
  const [searchLotQuery, setSearchLotQuery] = useState('');
  const [isSearchingLot, setIsSearchingLot] = useState(false);
  const [lotSearchResults, setLotSearchResults] = useState<any[]>([]);
  const [isLotDropdownOpen, setIsLotDropdownOpen] = useState(false);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [lotCacheMap, setLotCacheMap] = useState<Map<string, any>>(new Map());
  const lotDropdownRef = useRef<HTMLDivElement>(null);
  const lotSearchInputRef = useRef<HTMLInputElement>(null);

  // Common Editable fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [truckNo, setTruckNo] = useState('');
  const [vehicleType, setVehicleType] = useState('Truck');
  const [vehicleTypeOther, setVehicleTypeOther] = useState('');
  const [weighbridgeSlipNo, setWeighbridgeSlipNo] = useState('');
  const [weighbridgeCharge, setWeighbridgeCharge] = useState<number | ''>('');

  // Common Global Record Fields
  const [globalGrossWeight, setGlobalGrossWeight] = useState<number | ''>('');
  const [globalEmptyWeight, setGlobalEmptyWeight] = useState<number | ''>('');
  const [displayWeightDetails, setDisplayWeightDetails] = useState(false);
  const [transportationName, setTransportationName] = useState('');
  const [driverNumber, setDriverNumber] = useState('');

  // Selected Inwards
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  useEffect(() => {
    if (isCarryOver && clientIds.length > 0) {
      Promise.all(clientIds.map(cId => {
        const isWarehouse = warehouses.some((w: any) => w._id === cId);
        return getAvailableInwardsForClient(cId, isWarehouse);
      })).then(results => {
        let items = results.flat() || [];
        if (prefillData?.warehouseId && prefillData?.chamberName && prefillData?.floorNo && prefillData?.stackNo) {
          items = items.filter((i: any) => {
            const chMatch = i.chamberName === prefillData.chamberName || i.chamberNo?.toString() === prefillData.chamberName;
            return chMatch && i.floorNo === parseInt(prefillData.floorNo) && i.stackNo === parseInt(prefillData.stackNo);
          });
        }
        setAvailableInwards(items);
        setSelectedItems(prev => prev.filter(item => {
          const cId = item.inward?.clientId?._id || item.inward?.clientId;
          const wId = item.inward?.warehouseId?._id || item.inward?.warehouseId;
          return clientIds.includes(cId) || clientIds.includes(wId);
        }));
      });
    } else if (!isCarryOver && clientId) {
      const isWarehouse = warehouses.some((w: any) => w._id === clientId);
      getAvailableInwardsForClient(clientId, isWarehouse).then(res => {
        let items = res || [];

        // Filter by stack if coming from Stack Details page
        if (prefillData?.warehouseId && prefillData?.chamberName && prefillData?.floorNo && prefillData?.stackNo) {
          items = items.filter((i: any) => {
            const chMatch = i.chamberName === prefillData.chamberName || i.chamberNo?.toString() === prefillData.chamberName;
            return chMatch && i.floorNo === parseInt(prefillData.floorNo) && i.stackNo === parseInt(prefillData.stackNo);
          });
        }

        setAvailableInwards(items);
        setSelectedItems(prev => {
          if (prev.length > 0 && prev.every(item => {
            const cId = item.inward?.clientId?._id || item.inward?.clientId;
            const wId = item.inward?.warehouseId?._id || item.inward?.warehouseId;
            return cId === clientId || (isWarehouse && wId === clientId);
          })) {
            return prev;
          }
          return [];
        });
      });
    } else {
      setAvailableInwards([]);
      setSelectedItems([]);
    }
  }, [clientId, clientIds, isCarryOver, warehouses, prefillData]);

  // Stack QR Verification State
  const [scanningStackForInwardId, setScanningStackForInwardId] = useState<string | null>(null);
  const [scanningTargetStackKey, setScanningTargetStackKey] = useState<string | null>(null);

  const handleStackQrScanForItem = (scannedText: string) => {
    if (!scanningStackForInwardId) return;

    const parsed = parseStackQrString(scannedText);
    if (!parsed) {
      toast.error('Invalid Stack QR code format. QR must contain Chamber, Floor, and Stack details.');
      return;
    }

    const targetItem = selectedItems.find(item => item.inwardId === scanningStackForInwardId);
    if (!targetItem) return;

    const uniqueStacks = getUniqueInwardStacks(targetItem.inward);
    if (uniqueStacks.length === 0) {
      toast.error('No stack allocations found for this inward item.');
      return;
    }

    let matchedStackKey: string | null = null;
    let matchedStackObj: InwardStackLocation | null = null;

    if (scanningTargetStackKey) {
      const targetObj = uniqueStacks.find(s => s.key === scanningTargetStackKey);
      if (targetObj && isSingleStackAllocMatch(parsed, targetObj, targetItem.inward.warehouseId)) {
        matchedStackKey = targetObj.key;
        matchedStackObj = targetObj;
      }
    } else {
      for (const sObj of uniqueStacks) {
        if (isSingleStackAllocMatch(parsed, sObj, targetItem.inward.warehouseId)) {
          matchedStackKey = sObj.key;
          matchedStackObj = sObj;
          break;
        }
      }
    }

    if (matchedStackKey && matchedStackObj) {
      const currentVerifiedStacks = { ...(targetItem.verifiedStacks || {}), [matchedStackKey]: true };
      const allVerified = uniqueStacks.every(s => currentVerifiedStacks[s.key] === true);

      setSelectedItems(selectedItems.map(item => {
        if (item.inwardId === scanningStackForInwardId) {
          return {
            ...item,
            verifiedStacks: currentVerifiedStacks,
            verified: allVerified,
            verificationError: null,
          };
        }
        return item;
      }));

      if (allVerified) {
        toast.success('All Stacks Verified ✓');
      } else {
        toast.success(`Verified ✓ ${matchedStackObj.displayName}`);
      }
    } else {
      const targetObj = scanningTargetStackKey ? uniqueStacks.find(s => s.key === scanningTargetStackKey) : null;
      const expectedText = targetObj ? targetObj.displayName : uniqueStacks.map(s => s.displayName).join(', ');
      const errMsg = `Incorrect stack QR code scanned. Stack does not match expected location (${expectedText}).`;
      toast.error(errMsg);

      setSelectedItems(selectedItems.map(item => {
        if (item.inwardId === scanningStackForInwardId) {
          return {
            ...item,
            verified: false,
            verificationError: errMsg,
          };
        }
        return item;
      }));
    }

    setScanningStackForInwardId(null);
    setScanningTargetStackKey(null);
  };

  const handleQrScanSuccess = async (scannedText: string) => {
    setIsResolvingQr(true);
    try {
      const res = await resolveQRForColdOutward(scannedText);
      if (res.success && res.clientId && res.inward) {
        const inward = res.inward;
        const commodity = commodities.find((c: any) => c._id === (inward.commodityId?._id || inward.commodityId));
        const isGradingFromInward = inward.gradingApplied === true;

        const initialStackSelections: Record<string, any> = {};
        if (inward.availableAllocations && inward.availableAllocations.length > 1) {
          inward.availableAllocations.forEach((alloc: any) => {
            const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
            initialStackSelections[allocKey] = {
              selected: true,
              outwardWeight: alloc.availableQty,
              bagsCount: alloc.bagsCount || null,
              jin: null,
              mixed: null
            };
          });
        }

        const inwardId = inward.uniqueKey || inward._id;
        const remainingQtyDb = inward.remainingQuantityKg !== undefined && inward.remainingQuantityKg !== null ? inward.remainingQuantityKg : (inward.quantityKg || 0);

        const newItem = {
          inwardId,
          inward,
          grade: inward.grade || '',
          bagsCount: inward.bagsCount || null,
          jin: inward.jin || null,
          mixed: inward.mixed || null,
          plusMinus: '-',
          netWeightLoss: null,
          grossWeight: remainingQtyDb || null,
          emptyWeight: 0,
          gradingApplied: isGradingFromInward ? true : false,
          gradingChargeType: isGradingFromInward && inward.gradingChargeType ? inward.gradingChargeType : (commodity?.gradingCharge?.type || 'Per Bag'),
          gradingRate: isGradingFromInward && inward.gradingRate !== undefined ? inward.gradingRate : (commodity?.gradingCharge?.defaultRate || 0),
          verifyStockWithQr: true,
          verified: false,
          verifiedStacks: {},
          verificationError: null,
          stackSelections: initialStackSelections,
        };

        if (isCarryOver) {
          if (!clientIds.includes(res.clientId)) {
            setClientIds([...clientIds, res.clientId]);
          }
        } else {
          setClientId(res.clientId);
        }
        setAvailableInwards(prev => {
          const exists = prev.some((i: any) => i.uniqueKey === inward.uniqueKey || i._id === inward._id);
          return exists ? prev : [inward, ...prev];
        });
        setSelectedItems([newItem]);

        toast.success(res.message || `Loaded receipt details for client.`);
      } else {
        toast.error(res.error || 'Failed to resolve QR code.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error processing scanned QR code.');
    } finally {
      setIsResolvingQr(false);
    }
  };

  // Handle click outside to close lot dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (lotDropdownRef.current && !lotDropdownRef.current.contains(event.target as Node)) {
        setIsLotDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search for lot numbers when dropdown is open
  useEffect(() => {
    if (!isLotDropdownOpen) return;

    const timer = setTimeout(async () => {
      setIsSearchingLot(true);
      try {
        const { searchMultipleColdInwardsByLotNo } = await import('@/app/actions/cold-inward-actions');
        const inwards = await searchMultipleColdInwardsByLotNo(searchLotQuery.trim());
        setLotSearchResults(inwards || []);
        if (inwards && inwards.length > 0) {
          setLotCacheMap(prev => {
            const next = new Map(prev);
            inwards.forEach((i: any) => {
              next.set(i.uniqueKey || i._id, i);
            });
            return next;
          });
        }
      } catch (err: any) {
        console.error('Error fetching lots:', err);
        toast.error(err.message || 'Error fetching lot numbers.');
      } finally {
        setIsSearchingLot(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchLotQuery, isLotDropdownOpen]);

  // Auto focus search input when dropdown opens
  useEffect(() => {
    if (isLotDropdownOpen) {
      setTimeout(() => {
        lotSearchInputRef.current?.focus();
      }, 50);
    }
  }, [isLotDropdownOpen]);

  const handleToggleLotSelection = (itemId: string) => {
    if (selectedLotIds.includes(itemId)) {
      setSelectedLotIds(prev => prev.filter(id => id !== itemId));
      return;
    }

    const inward = lotSearchResults.find(i => (i.uniqueKey || i._id) === itemId) || lotCacheMap.get(itemId);
    const resClientId = inward?.clientId?._id || inward?.clientId;

    if (!isCarryOver && resClientId) {
      const currentLotClients = selectedLotIds
        .map(id => lotSearchResults.find(i => (i.uniqueKey || i._id) === id) || lotCacheMap.get(id))
        .map(i => i?.clientId?._id || i?.clientId)
        .filter(Boolean);
      const targetClient = clientId || (currentLotClients.length > 0 ? currentLotClients[0] : null);

      if (targetClient && targetClient !== resClientId) {
        toast.error('Multiple client lots can only be selected when Carry Over (C/o) is enabled.');
        return;
      }
    }

    setSelectedLotIds(prev => [...prev, itemId]);
  };

  // Filter lots strictly by Lot No (case-insensitive partial matching)
  const displayedLots = searchLotQuery.trim()
    ? lotSearchResults.filter(inward =>
        inward.lotNo && String(inward.lotNo).toLowerCase().includes(searchLotQuery.trim().toLowerCase())
      )
    : lotSearchResults;

  const handleSelectAll = () => {
    if (displayedLots.length === 0) return;
    const visibleIds = displayedLots.map(i => i.uniqueKey || i._id);

    if (isCarryOver) {
      setSelectedLotIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    } else {
      let targetClient = clientId;
      if (!targetClient && selectedLotIds.length > 0) {
        const firstSelected = displayedLots.find(i => (i.uniqueKey || i._id) === selectedLotIds[0]) || lotCacheMap.get(selectedLotIds[0]);
        targetClient = firstSelected?.clientId?._id || firstSelected?.clientId;
      }
      if (!targetClient && displayedLots.length > 0) {
        targetClient = displayedLots[0].clientId?._id || displayedLots[0].clientId;
      }

      const matching = displayedLots.filter(i => {
        const cId = i.clientId?._id || i.clientId;
        return !targetClient || cId === targetClient;
      });

      if (matching.length < visibleIds.length) {
        toast('Selected lots matching client. Enable Carry Over (C/o) for multiple clients.');
      }
      const matchIds = matching.map(i => i.uniqueKey || i._id);
      setSelectedLotIds(prev => Array.from(new Set([...prev, ...matchIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedLotIds([]);
  };

  const handleRemoveSelectedLot = (id: string) => {
    setSelectedLotIds(prev => prev.filter(item => item !== id));
  };

  const handleAddSelectedLots = () => {
    if (selectedLotIds.length === 0) {
      toast.error('Please select at least one lot.');
      return;
    }

    let hasError = false;
    let newItems: any[] = [];
    let updatedClientIds = [...clientIds];
    let newClientId = clientId;
    let newAvailableInwards = [...availableInwards];
    let addedCount = 0;

    for (const inwardId of selectedLotIds) {
      const inward = lotSearchResults.find(i => (i.uniqueKey || i._id) === inwardId) || lotCacheMap.get(inwardId);
      if (!inward) continue;

      if (selectedItems.some(item => item.inwardId === inwardId) || newItems.some(item => item.inwardId === inwardId)) {
        toast.error(`Lot ${inward.lotNo} is already added.`);
        continue;
      }

      const resClientId = inward.clientId?._id || inward.clientId;
      if (isCarryOver && resClientId) {
        if (!updatedClientIds.includes(resClientId)) {
          updatedClientIds.push(resClientId);
        }
      } else if (!isCarryOver && resClientId) {
        if (newClientId && newClientId !== resClientId) {
          toast.error(`Lot No ${inward.lotNo} belongs to a different client. Select a lot from the same client.`);
          hasError = true;
          continue;
        }
        if (!newClientId) {
          newClientId = resClientId;
        }
      }

      const commodity = commodities.find((c: any) => c._id === (inward.commodityId?._id || inward.commodityId));
      const isGradingFromInward = inward.gradingApplied === true;
      const remainingQtyDb = inward.remainingQuantityKg !== undefined && inward.remainingQuantityKg !== null ? inward.remainingQuantityKg : (inward.quantityKg || 0);

      const initialStackSelections: Record<string, any> = {};
      if (inward.stackAllocations && inward.stackAllocations.length > 0) {
        inward.availableAllocations = inward.stackAllocations.map((alloc: any) => ({
          ...alloc,
          availableQty: alloc.allocatedWeight,
          bagsCount: alloc.bagsCount
        }));

        if (inward.availableAllocations.length > 1) {
          inward.availableAllocations.forEach((alloc: any) => {
            const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
            initialStackSelections[allocKey] = {
              selected: true,
              outwardWeight: alloc.availableQty,
              bagsCount: alloc.bagsCount || null,
              jin: null,
              mixed: null
            };
          });
        }
      }

      newItems.push({
        inwardId,
        inward,
        grade: inward.grade || '',
        bagsCount: inward.bagsCount || null,
        jin: inward.jin || null,
        mixed: inward.mixed || null,
        plusMinus: '-',
        netWeightLoss: null,
        grossWeight: remainingQtyDb || null,
        emptyWeight: 0,
        outwardWeight: remainingQtyDb || null,
        gradingApplied: isGradingFromInward ? true : false,
        gradingChargeType: isGradingFromInward && inward.gradingChargeType ? inward.gradingChargeType : (commodity?.gradingCharge?.type || 'Per Bag'),
        gradingRate: isGradingFromInward && inward.gradingRate !== undefined ? inward.gradingRate : (commodity?.gradingCharge?.defaultRate || 0),
        verifyStockWithQr: false,
        verified: false,
        verifiedStacks: {},
        verificationError: null,
        stackSelections: initialStackSelections,
      });

      if (!newAvailableInwards.some((i: any) => (i.uniqueKey || i._id) === inwardId)) {
        newAvailableInwards.unshift(inward);
      }
      addedCount++;
    }

    if (isCarryOver) {
      setClientIds(updatedClientIds);
    } else if (newClientId) {
      setClientId(newClientId);
    }
    setAvailableInwards(newAvailableInwards);
    setSelectedItems(prev => [...prev, ...newItems]);
    
    if (addedCount > 0) {
      toast.success(`Successfully added ${addedCount} lot(s).`);
      setSelectedLotIds([]);
      setSearchLotQuery('');
      setIsLotDropdownOpen(false);
    } else if (!hasError) {
      setIsLotDropdownOpen(false);
    }
  };


  useEffect(() => {
    if (prefillData?.qr || prefillData?.qrId || prefillData?.transferId) {
      const code = prefillData.qr || prefillData.qrId || prefillData.transferId;
      if (code) {
        handleQrScanSuccess(code);
      }
    } else if (prefillData?.receiptNo || prefillData?.lotNo) {
      const fetchBySearch = async () => {
        setIsResolvingQr(true);
        try {
          const { searchColdInwardByReceipt, searchColdInwardByLotNo } = await import('@/app/actions/cold-inward-actions');
          let inward;
          if (prefillData.receiptNo) {
            inward = await searchColdInwardByReceipt(prefillData.receiptNo);
          } else if (prefillData.lotNo) {
            inward = await searchColdInwardByLotNo(prefillData.lotNo);
          }
          if (inward) {
            const commodity = commodities.find((c: any) => c._id === (inward.commodityId?._id || inward.commodityId));
            const isGradingFromInward = inward.gradingApplied === true;

            const remainingQtyDb = inward.remainingQuantityKg !== undefined && inward.remainingQuantityKg !== null ? inward.remainingQuantityKg : (inward.quantityKg || 0);

            const initialStackSelections: Record<string, any> = {};
            if (inward.stackAllocations && inward.stackAllocations.length > 0) {
              inward.availableAllocations = inward.stackAllocations.map((alloc: any) => ({
                ...alloc,
                availableQty: alloc.allocatedWeight,
                bagsCount: alloc.bagsCount
              }));

              if (inward.availableAllocations.length > 1) {
                inward.availableAllocations.forEach((alloc: any) => {
                  const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
                  initialStackSelections[allocKey] = {
                    selected: true,
                    outwardWeight: alloc.availableQty,
                    bagsCount: alloc.bagsCount || null,
                    jin: null,
                    mixed: null
                  };
                });
              }
            }

            const inwardId = inward.uniqueKey || inward._id;

            const newItem = {
              inwardId,
              inward,
              grade: inward.grade || '',
              bagsCount: inward.bagsCount || null,
              jin: inward.jin || null,
              mixed: inward.mixed || null,
              plusMinus: '-',
              netWeightLoss: null,
              grossWeight: remainingQtyDb || null,
              emptyWeight: 0,
              gradingApplied: isGradingFromInward ? true : false,
              gradingChargeType: isGradingFromInward && inward.gradingChargeType ? inward.gradingChargeType : (commodity?.gradingCharge?.type || 'Per Bag'),
              gradingRate: isGradingFromInward && inward.gradingRate !== undefined ? inward.gradingRate : (commodity?.gradingCharge?.defaultRate || 0),
              verifyStockWithQr: false,
              verified: false,
              verifiedStacks: {},
              verificationError: null,
              stackSelections: initialStackSelections,
            };

            if (isCarryOver) {
              const resClientId = inward.clientId?._id || inward.clientId;
              if (!clientIds.includes(resClientId)) {
                setClientIds([...clientIds, resClientId]);
              }
            } else {
              setClientId(inward.clientId?._id || inward.clientId);
            }
            setAvailableInwards(prev => {
              const exists = prev.some((i: any) => i.uniqueKey === inwardId || i._id === inwardId);
              return exists ? prev : [inward, ...prev];
            });
            setSelectedItems([newItem]);
            toast.success(`Loaded details for ${prefillData.receiptNo ? `Receipt ${prefillData.receiptNo}` : `Lot No ${prefillData.lotNo}`}`);
          } else {
            toast.error('Inward not found or no available stock.');
          }
        } catch (error: any) {
          toast.error(error.message || 'Error loading inward details.');
        } finally {
          setIsResolvingQr(false);
        }
      };
      fetchBySearch();
    }
  }, [prefillData, commodities, clients]);

  const handleAddInward = (inwardId: string) => {
    if (!inwardId) return;
    const inward = availableInwards.find(i => i.uniqueKey === inwardId);
    if (!inward) return;

    // Check if already added
    if (selectedItems.some(item => item.inwardId === inwardId)) {
      toast.error('Inward already added');
      return;
    }

    const commodity = commodities.find(c => c._id === (inward.commodityId?._id || inward.commodityId));
    const isGradingFromInward = inward.gradingApplied === true;
    const remainingQtyDb = inward.remainingQuantityKg !== undefined && inward.remainingQuantityKg !== null ? inward.remainingQuantityKg : (inward.quantityKg || 0);

    const initialStackSelections: Record<string, any> = {};
    if (inward.availableAllocations && inward.availableAllocations.length > 1) {
      inward.availableAllocations.forEach((alloc: any) => {
        const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
        initialStackSelections[allocKey] = {
          selected: true,
          outwardWeight: alloc.availableQty,
          bagsCount: alloc.bagsCount || null,
          jin: null,
          mixed: null
        };
      });
    }

    setSelectedItems([
      ...selectedItems,
      {
        inwardId,
        inward,
        grade: inward.grade || '',
        bagsCount: inward.bagsCount || null,
        jin: inward.jin || null,
        mixed: inward.mixed || null,
        plusMinus: '-',
        netWeightLoss: null,
        grossWeight: remainingQtyDb || null,
        emptyWeight: null,
        outwardWeight: remainingQtyDb || null,
        gradingApplied: isGradingFromInward ? true : false,
        gradingChargeType: isGradingFromInward && inward.gradingChargeType ? inward.gradingChargeType : (commodity?.gradingCharge?.type || 'Per Bag'),
        gradingRate: isGradingFromInward && inward.gradingRate !== undefined ? inward.gradingRate : (commodity?.gradingCharge?.defaultRate || 0),
        verifyStockWithQr: false,
        verified: false,
        verifiedStacks: {},
        verificationError: null,
        stackSelections: initialStackSelections,
      }
    ]);
  };

  const handleRemoveInward = (inwardId: string) => {
    setSelectedItems(selectedItems.filter(item => item.inwardId !== inwardId));
  };

  const handleItemChange = (inwardId: string, field: string, value: any) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.inwardId === inwardId) {
        let updates: any = { [field]: value };
        const ratio = (item.inward.originalQuantityKg || item.inward.quantityKg || 0) / (item.inward.originalBagsCount || item.inward.bagsCount || 1);

        if (ratio > 0) {
          if (field === 'bagsCount') {
            const wholeVal = value ? Math.round(Number(value)) : null;
            updates[field] = wholeVal;
            if (wholeVal !== null) {
              updates['outwardWeight'] = Number((wholeVal * ratio).toFixed(2));
            }
          } else if (field === 'outwardWeight') {
            const val = value ? Number(value) : null;
            if (val !== null) {
              updates['bagsCount'] = Math.round(val / ratio);
            }
          }
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const handleStackSelectionChange = (inwardId: string, allocKey: string, field: string, value: any) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.inwardId === inwardId) {
        const currentSelections = item.stackSelections || {};
        const currentStack = currentSelections[allocKey] || { selected: false, outwardWeight: null, bagsCount: null, jin: null, mixed: null };

        let updates: any = { [field]: value };
        const ratio = (item.inward.originalQuantityKg || item.inward.quantityKg || 0) / (item.inward.originalBagsCount || item.inward.bagsCount || 1);

        if (ratio > 0) {
          if (field === 'bagsCount') {
            const wholeVal = value ? Math.round(Number(value)) : null;
            updates[field] = wholeVal;
            if (wholeVal !== null) {
              updates['outwardWeight'] = Number((wholeVal * ratio).toFixed(2));
            }
          } else if (field === 'outwardWeight') {
            const val = value ? Number(value) : null;
            if (val !== null) {
              updates['bagsCount'] = Math.round(val / ratio);
            }
          }
        }

        return {
          ...item,
          stackSelections: {
            ...currentSelections,
            [allocKey]: {
              ...currentStack,
              ...updates
            }
          }
        };
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAnyClientSelected = isCarryOver ? clientIds.length > 0 : !!clientId;
    if (!isAnyClientSelected || selectedItems.length === 0) {
      toast.error(t('outward.fillRequired'));
      return;
    }
    if (!truckNo || truckNo.trim() === '') {
      toast.error('Truck Number is required');
      return;
    }

    // Validate Stack QR Verification if enabled
    for (let idx = 0; idx < selectedItems.length; idx++) {
      const item = selectedItems[idx];
      if (item.verifyStockWithQr) {
        const uniqueStacks = getUniqueInwardStacks(item.inward);
        const unverifiedStack = uniqueStacks.find(s => !item.verifiedStacks?.[s.key]);
        if (unverifiedStack) {
          toast.error(`Stock verification required for Item ${idx + 1} (${item.inward?.commodityId?.name || 'Inward'}). Unverified stack: ${unverifiedStack.displayName}`);
          return;
        }
      }
    }

    // Validate quantities
    const totalOutwardWeight = selectedItems.reduce((acc, item) => {
      const isMultiStack = item.inward.availableAllocations && item.inward.availableAllocations.length > 1;
      const calcOutwardWeight = isMultiStack
        ? Object.values(item.stackSelections || {}).reduce((sum: number, s: any) => sum + (s.selected ? (Number(s.outwardWeight) || 0) : 0), 0)
        : (Number(item.outwardWeight || 0));
      return acc + calcOutwardWeight;
    }, 0);
    const computedWeightLoss = (Number(globalGrossWeight || 0) - Number(globalEmptyWeight || 0)) - totalOutwardWeight;

    const itemsPayload = [];
    for (const item of selectedItems) {
      const isMultiStack = item.inward.availableAllocations && item.inward.availableAllocations.length > 1;
      const autoGradingType = commodities.find(c => c._id === (item.inward.commodityId?._id || item.inward.commodityId))?.gradingType || '';

      if (isMultiStack) {
        const availableAllocations = item.inward.availableAllocations;
        const selectedAllocations = availableAllocations.filter((alloc: any) => {
          const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
          return item.stackSelections?.[allocKey]?.selected === true;
        });

        if (selectedAllocations.length === 0) {
          toast.error(`Please select at least one stack for outward in Item (${item.inward?.commodityId?.name || 'Inward'})`);
          return;
        }

        for (const alloc of selectedAllocations) {
          const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
          const stackSel = item.stackSelections?.[allocKey];
          const outwardWeight = Number(stackSel?.outwardWeight || 0);

          if (outwardWeight <= 0) {
            toast.error(`Please enter valid outward weight for selected stack ${alloc.stackName || alloc.stackNo}`);
            return;
          }

          if (outwardWeight > alloc.availableQty) {
            toast.error(`Outward weight for Stack ${alloc.stackName || alloc.stackNo} exceeds available quantity (${alloc.availableQty} KG)`);
            return;
          }

          const deductLargeBags = Number(stackSel?.bagsCount || 0);
          const deductSmallBags = Number(stackSel?.jin || 0);
          const deductMixedBags = Number(stackSel?.mixed || 0);
          const deductTotalBags = deductLargeBags + deductSmallBags + deductMixedBags;

          let calculatedGradingCharge = 0;
          if (item.gradingApplied) {
            calculatedGradingCharge = item.gradingChargeType === 'Per Bag'
              ? deductTotalBags * (item.gradingRate || 0)
              : outwardWeight * (item.gradingRate || 0);
          }

          itemsPayload.push({
            inwardId: item.inward._id,
            clientId: item.inward.clientId?._id || item.inward.clientId,
            commodityId: item.inward.commodityId._id || item.inward.commodityId,
            warehouseId: item.inward.warehouseId._id || item.inward.warehouseId,
            chamberName: alloc.chamberName,
            chamberNo: alloc.chamberNo,
            floorName: alloc.floorName,
            floorNo: alloc.floorNo,
            stackName: alloc.stackName,
            stackNo: alloc.stackNo,
            quantityKg: outwardWeight,
            bagsCount: deductLargeBags,
            grade: autoGradingType === 'Grading' ? item.grade : undefined,
            gradingType: autoGradingType || undefined,
            seed: item.inward.seed,
            tableLabel: item.inward.tableLabel,
            jin: deductSmallBags,
            mixed: deductMixedBags,
            plusMinus: 0,
            netWeightLoss: computedWeightLoss,
            totalBags: deductTotalBags,
            weighbridgeSlipNo: item.inward.weighbridgeSlipNo,
            grossWeight: globalGrossWeight ? Number(globalGrossWeight) : 0,
            emptyWeight: globalEmptyWeight ? Number(globalEmptyWeight) : 0,
            displayWeightDetails: displayWeightDetails,
            transportationName: transportationName,
            driverNumber: driverNumber,
            kataBharati: deductTotalBags > 0 ? outwardWeight / deductTotalBags : 0,
            marko: item.inward.marko,
            referencePersons: item.inward.referencePersons,
            gradingApplied: item.gradingApplied,
            gradingChargeType: item.gradingChargeType,
            gradingRate: item.gradingRate,
            gradingCharge: calculatedGradingCharge,
          });
        }
      } else {
        // Single stack receipt flow
        const calcNetWeight = Number(item.outwardWeight || 0);
        const calcTotalBags = Number(item.bagsCount || 0) + Number(item.jin || 0) + Number(item.mixed || 0);

        if (calcNetWeight <= 0) {
          toast.error(`Please enter valid weight for inward ${item.inwardId.slice(-4)}`);
          return;
        }

        const remainingQtyDb = item.inward.remainingQuantityKg !== undefined && item.inward.remainingQuantityKg !== null
          ? item.inward.remainingQuantityKg
          : (item.inward.quantityKg || 0);

        if (calcNetWeight > remainingQtyDb) {
          toast.error(`Quantity exceeds available stock (${remainingQtyDb.toFixed(2)} KG) for inward ${item.inwardId.slice(-4)}`);
          return;
        }

        const allocations = item.inward.availableAllocations || [item.inward];

        let remainingNetWeight = calcNetWeight;
        let remainingLargeBags = Number(item.bagsCount) || 0;
        let remainingSmallBags = Number(item.jin) || 0;
        let remainingMixedBags = Number(item.mixed) || 0;

        for (let i = 0; i < allocations.length; i++) {
          const alloc = allocations[i];
          if (remainingNetWeight <= 0) break;

          const allocAvailQty = allocations.length === 1 ? remainingQtyDb : (alloc.availableQty || 0);
          const isLastAlloc = i === allocations.length - 1 || remainingNetWeight <= allocAvailQty;
          const deductNetWeight = Math.min(remainingNetWeight, allocAvailQty);
          
          if (deductNetWeight <= 0) continue;

          const ratio = deductNetWeight / calcNetWeight;

          const deductLargeBags = isLastAlloc ? remainingLargeBags : Math.round(Number(item.bagsCount || 0) * ratio);
          const deductSmallBags = isLastAlloc ? remainingSmallBags : Math.round(Number(item.jin || 0) * ratio);
          const deductMixedBags = isLastAlloc ? remainingMixedBags : Math.round(Number(item.mixed || 0) * ratio);

          remainingNetWeight -= deductNetWeight;
          remainingLargeBags -= deductLargeBags;
          remainingSmallBags -= deductSmallBags;
          remainingMixedBags -= deductMixedBags;

          const grossWeightPart = globalGrossWeight ? Number(globalGrossWeight) : 0;
          const emptyWeightPart = globalEmptyWeight ? Number(globalEmptyWeight) : 0;
          const deductTotalBags = deductLargeBags + deductSmallBags + deductMixedBags;

          let calculatedGradingCharge = 0;
          if (item.gradingApplied) {
            calculatedGradingCharge = item.gradingChargeType === 'Per Bag'
              ? deductTotalBags * (item.gradingRate || 0)
              : deductNetWeight * (item.gradingRate || 0);
          }

          itemsPayload.push({
            inwardId: item.inward._id,
            lotNo: item.inward.lotNo || item.inward.lotNumber || undefined,
            clientId: item.inward.clientId?._id || item.inward.clientId,
            commodityId: item.inward.commodityId._id || item.inward.commodityId,
            warehouseId: item.inward.warehouseId._id || item.inward.warehouseId,
            chamberName: alloc.chamberName,
            chamberNo: alloc.chamberNo,
            floorName: alloc.floorName,
            floorNo: alloc.floorNo,
            stackName: alloc.stackName,
            stackNo: alloc.stackNo,
            quantityKg: deductNetWeight,
            bagsCount: deductLargeBags,
            grade: autoGradingType === 'Grading' ? item.grade : undefined,
            gradingType: autoGradingType || undefined,
            seed: item.inward.seed,
            tableLabel: item.inward.tableLabel,
            jin: deductSmallBags,
            mixed: deductMixedBags,
            plusMinus: 0,
            netWeightLoss: computedWeightLoss,
            totalBags: deductTotalBags,
            weighbridgeSlipNo: item.inward.weighbridgeSlipNo,
            grossWeight: grossWeightPart,
            emptyWeight: emptyWeightPart,
            displayWeightDetails: displayWeightDetails,
            transportationName: transportationName,
            driverNumber: driverNumber,
            kataBharati: deductTotalBags > 0 ? deductNetWeight / deductTotalBags : 0,
            marko: item.inward.marko,
            referencePersons: item.inward.referencePersons,
            gradingApplied: item.gradingApplied,
            gradingChargeType: item.gradingChargeType,
            gradingRate: item.gradingRate,
            gradingCharge: calculatedGradingCharge,
          });
        }
      }
    }

    setLoading(true);
    try {
      const activeClientId = isCarryOver ? clientIds[0] : clientId;
      const clientModel = warehouses.some((w: any) => w._id === activeClientId) ? 'ColdWarehouse' : 'Client';
      
      const payloadItems = itemsPayload.map(ip => {
        const itemClientId = ip.clientId || activeClientId;
        return {
          ...ip,
          clientId: itemClientId,
          clientModel: warehouses.some((w: any) => w._id === itemClientId) ? 'ColdWarehouse' : 'Client',
        };
      });

      const res = await createBatchColdOutwards({
        clientId: activeClientId,
        clientModel,
        date,
        truckNo,
        vehicleType: vehicleType === 'Other' ? vehicleTypeOther : vehicleType,
        weighbridgeSlipNo,
        weighbridgeCharge: weighbridgeCharge === '' ? undefined : weighbridgeCharge,
        remarks,
        note,
        items: payloadItems,
        isCarryOver,
        carryOverClientId: isCarryOver ? carryOverClientId : undefined,
        carryOverClientName: isCarryOver ? clients.find(c => c._id === carryOverClientId)?.name : undefined
      });

      if (res.success) {
        toast.success(t('outward.outwardCreated'));
        onSuccess();
      } else {
        toast.error(res.error || t('outward.saveFailed'));
      }
    } catch (err) {
      toast.error(t('outward.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border rounded-lg bg-slate-50">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="font-semibold text-lg">{t('outward.newTransaction')}</h3>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsQrScannerOpen(true)}
          disabled={isResolvingQr}
          className="border-rose-300 text-rose-700 hover:bg-rose-50 flex items-center gap-2"
        >
          {isResolvingQr ? <Loader2 className="h-4 w-4 animate-spin text-rose-600" /> : <QrCode className="h-4 w-4 text-rose-600" />}
          Scan Receipt QR
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 flex flex-col justify-start pt-1">
          <label className="flex items-center space-x-2 cursor-pointer pb-1">
            <input type="checkbox" checked={isCarryOver} onChange={(e) => setIsCarryOver(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm font-medium text-slate-700">Carry Over (C/o)</span>
          </label>
          {isCarryOver && (
            <SearchableSelect
              value={carryOverClientId}
              onValueChange={setCarryOverClientId}
              required={isCarryOver}
              placeholder="Select Carry Over Client"
              options={clients.map(c => ({ value: c._id, label: c.name }))}
            />
          )}
        </div>

        <div className="space-y-2 md:col-span-1" ref={lotDropdownRef}>
          <label className="text-sm font-medium text-slate-800">Lot No.</label>
          <div className="relative">
            {/* Dropdown Trigger Field displaying Selected Lots as Tags */}
            <div
              onClick={() => setIsLotDropdownOpen(prev => !prev)}
              className="min-h-[42px] w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm flex flex-wrap items-center gap-1.5 cursor-pointer shadow-sm hover:border-slate-400 focus-within:ring-2 focus-within:ring-indigo-500 transition-colors"
            >
              {selectedLotIds.length === 0 ? (
                <span className="text-slate-400 select-none text-xs sm:text-sm">Select Lot Numbers...</span>
              ) : (
                selectedLotIds.map(id => {
                  const item = lotSearchResults.find(i => (i.uniqueKey || i._id) === id) || lotCacheMap.get(id);
                  const lotLabel = item?.lotNo ? `Lot #${item.lotNo}` : id;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200"
                    >
                      <span>{lotLabel}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSelectedLot(id);
                        }}
                        className="hover:bg-indigo-100 rounded-full p-0.5 text-indigo-700 hover:text-indigo-900 transition-colors"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })
              )}
              <div className="ml-auto flex items-center gap-1.5 text-slate-400">
                {selectedLotIds.length > 0 && (
                  <span className="text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full font-semibold border border-slate-200">
                    {selectedLotIds.length}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isLotDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
              </div>
            </div>

            {/* Dropdown Popover */}
            {isLotDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
                {/* Search Bar */}
                <div className="p-2 border-b border-slate-200 bg-white">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      ref={lotSearchInputRef}
                      type="text"
                      placeholder="Search by Lot No..."
                      value={searchLotQuery}
                      onChange={(e) => setSearchLotQuery(e.target.value)}
                      className="pl-8 pr-8 h-8 text-xs bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsLotDropdownOpen(false);
                        }
                      }}
                    />
                    {searchLotQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearchLotQuery('');
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Toolbar: Select All & Clear Selection */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs">
                  <span className="text-slate-700 font-semibold">
                    {selectedLotIds.length} selected
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAll();
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSelection();
                      }}
                      disabled={selectedLotIds.length === 0}
                      className="text-slate-600 hover:text-rose-600 font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Options List */}
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1 bg-white">
                  {isSearchingLot ? (
                    <div className="flex items-center justify-center p-6 text-xs text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-indigo-600" />
                      Loading matching lots...
                    </div>
                  ) : displayedLots.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No available lots found.
                    </div>
                  ) : (
                    displayedLots.map((inward) => {
                      const itemId = inward.uniqueKey || inward._id;
                      const isSelected = selectedLotIds.includes(itemId);
                      const availableKg = inward.remainingQuantityKg !== undefined && inward.remainingQuantityKg !== null ? inward.remainingQuantityKg : (inward.quantityKg || 0);
                      const clientName = inward.clientId?.name || '-';

                      return (
                        <div
                          key={itemId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLotSelection(itemId);
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-50 border border-indigo-200'
                              : 'bg-white hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-xs">
                                {inward.lotNo}
                              </span>
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {formatNumber ? formatNumber(availableKg) : availableKg} KG
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2">
                              <span>Receipt: <strong className="text-slate-800 font-medium">{inward.receiptNumber || '-'}</strong></span>
                              <span>•</span>
                              <span>Client: <strong className="text-slate-800 font-medium">{clientName}</strong></span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between p-2 bg-slate-50 border-t border-slate-200">
                  <span className="text-xs text-slate-700 font-medium">
                    {selectedLotIds.length} lot(s) selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLotDropdownOpen(false);
                      }}
                      className="text-xs h-7 px-2.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={selectedLotIds.length === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSelectedLots();
                      }}
                      className="text-xs h-7 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                    >
                      Add Selected
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.clientName')}</label>
          {isCarryOver ? (
            <MultiSearchableSelect
              value={clientIds}
              onValueChange={setClientIds}
              placeholder={t('outward.selectClient')}
              options={[
                ...clients.map(c => ({ value: c._id, label: c.name })),
                ...warehouses.map((w: any) => ({ value: w._id, label: `${w.name} (Warehouse)` }))
              ]}
            />
          ) : (
            <SearchableSelect
              value={clientId}
              onValueChange={setClientId}
              required
              placeholder={t('outward.selectClient')}
              options={[
                ...clients.map(c => ({ value: c._id, label: c.name })),
                ...warehouses.map((w: any) => ({ value: w._id, label: `${w.name} (Warehouse)` }))
              ]}
            />
          )}
        </div>

        <div className="space-y-2 md:col-span-1">
          <label className="text-sm font-medium">{t('outward.selectInward')}</label>
          <div className="relative" ref={dropdownRef}>
            <div
              className={`flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${(!isCarryOver && !clientId) || (isCarryOver && clientIds.length === 0) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              onClick={() => { if ((!isCarryOver && clientId) || (isCarryOver && clientIds.length > 0)) setIsDropdownOpen(!isDropdownOpen); }}
            >
              <span className={selectedItems.length > 0 ? "text-slate-900" : "text-slate-500"}>
                {selectedItems.length > 0
                  ? `${selectedItems.length} inward(s) selected`
                  : t('outward.selectInward')}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </div>

            {isDropdownOpen && availableInwards.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-md max-h-60 overflow-y-auto">
                {availableInwards.map(inw => {
                  const isSelected = selectedItems.some(item => item.inwardId === inw.uniqueKey);
                  return (
                    <div
                      key={inw.uniqueKey}
                      className="flex items-center space-x-2 p-2 hover:bg-slate-100 cursor-pointer"
                      onClick={() => {
                        if (isSelected) {
                          handleRemoveInward(inw.uniqueKey);
                        } else {
                          handleAddInward(inw.uniqueKey);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-sm text-slate-700">
                        LOT: {inw.lotNo || '-'} | Receipt: {inw.receiptNumber || '-'} | {inw.date ? new Date(inw.date).toLocaleDateString('en-GB') : ''} | {inw.commodityId?.name}{inw.commodityId?.type ? `(${inw.commodityId.type})` : ''}{inw.commodityId?.unit ? ` [${inw.commodityId.unit}${inw.commodityId.siUnit ? ` / ${inw.commodityId.siUnit}` : ''}]` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {isDropdownOpen && availableInwards.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-md p-3 text-sm text-center text-slate-500">
                No inwards available
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded border">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.date')}</label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.truckNo')} *</label>
          <Input placeholder="Enter Truck Number" value={truckNo} onChange={(e) => setTruckNo(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Transportation Name</label>
          <Input placeholder="Enter Transportation Name" value={transportationName} onChange={(e) => setTransportationName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Driver/Transportation Number</label>
          <Input placeholder="Enter Driver Number" value={driverNumber} onChange={(e) => setDriverNumber(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Vehicle Type</label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="w-full h-10 px-3 py-2 border rounded-md text-sm bg-white"
          >
            <option value="Truck">Truck</option>
            <option value="Tempo">Tempo</option>
            <option value="Pickup">Pickup</option>
            <option value="Trailer">Trailer</option>
            <option value="Container">Container</option>
            <option value="Other">Other</option>
          </select>
          {vehicleType === 'Other' && (
            <Input className="mt-2" placeholder="Specify Vehicle Type" value={vehicleTypeOther} onChange={(e) => setVehicleTypeOther(e.target.value)} />
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Weighbridge No.</label>
          <Input value={weighbridgeSlipNo} onChange={(e) => setWeighbridgeSlipNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Weighbridge Charge</label>
          <ColdNumberInput min="0" value={weighbridgeCharge} onChange={(val) => setWeighbridgeCharge(val ? Number(val) : '')} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.remarks')}</label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.note')}</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded border border-slate-200">
        <div className="space-y-2">
          <label className="text-sm font-medium">Gross Weight (KG)</label>
          <ColdNumberInput min="0" value={globalGrossWeight} onChange={(val) => setGlobalGrossWeight(val ? Number(val) : '')} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Empty Weight (KG)</label>
          <ColdNumberInput min="0" value={globalEmptyWeight} onChange={(val) => setGlobalEmptyWeight(val ? Number(val) : '')} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-green-700">Net Weight (KG)</label>
          <div className="px-3 py-2 border rounded-md bg-white text-slate-700 font-bold shadow-sm">
            {(Number(globalGrossWeight || 0) - Number(globalEmptyWeight || 0)).toFixed(2)}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-blue-700">Weight Loss (KG)</label>
          <div className="px-3 py-2 border rounded-md bg-white text-slate-700 font-bold shadow-sm">
            {((Number(globalGrossWeight || 0) - Number(globalEmptyWeight || 0)) - selectedItems.reduce((acc, item) => {
              const isMultiStack = item.inward.availableAllocations && item.inward.availableAllocations.length > 1;
              const calcOutwardWeight = isMultiStack
                ? Object.values(item.stackSelections || {}).reduce((sum: number, s: any) => sum + (s.selected ? (Number(s.outwardWeight) || 0) : 0), 0)
                : (Number(item.outwardWeight || 0));
              return acc + calcOutwardWeight;
            }, 0)).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-slate-50 p-4 rounded border border-slate-200 mt-4">
        <input
          type="checkbox"
          id="displayWeightDetails"
          checked={displayWeightDetails}
          onChange={(e) => setDisplayWeightDetails(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <label htmlFor="displayWeightDetails" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
          Display Weight Details in Gate Pass
        </label>
      </div>

      {selectedItems.map((item, index) => {
        const remainingQtyDb = item.inward.remainingQuantityKg !== undefined && item.inward.remainingQuantityKg !== null
          ? item.inward.remainingQuantityKg
          : (item.inward.quantityKg || 0);

        const isMultiStack = item.inward.availableAllocations && item.inward.availableAllocations.length > 1;
        const calcNetWeight = isMultiStack
          ? Object.values(item.stackSelections || {}).reduce((sum: number, s: any) => sum + (s.selected ? (Number(s.outwardWeight) || 0) : 0), 0)
          : (Number(item.outwardWeight || 0));

        const calcTotalBags = isMultiStack
          ? Object.values(item.stackSelections || {}).reduce((sum: number, s: any) => sum + (s.selected ? ((Number(s.bagsCount) || 0) + (Number(s.jin) || 0) + (Number(s.mixed) || 0)) : 0), 0)
          : (Number(item.bagsCount || 0) + Number(item.jin || 0) + Number(item.mixed || 0));

        const calcKataBharati = calcTotalBags > 0 ? (calcNetWeight / calcTotalBags) : 0;

        return (
          <div key={item.inwardId} className="bg-white p-4 rounded border border-slate-200 relative mt-4 shadow-sm">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => handleRemoveInward(item.inwardId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>

            <h4 className="font-semibold mb-4 text-slate-700 flex flex-wrap items-center gap-2">
              <span>Item {index + 1}: {item.inward.commodityId?.name}{item.inward.commodityId?.type ? ` (${item.inward.commodityId.type})` : ''}</span>
              {item.inward.commodityId?.unit && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-normal border border-slate-200">
                  Unit: {item.inward.commodityId.unit} {item.inward.commodityId.siUnit ? `| SI: ${item.inward.commodityId.siUnit}` : ''}
                </span>
              )}
              <span className="text-slate-500 font-normal">
                - {(item.inward.availableAllocations || [{ chamberName: item.inward.chamberName, chamberNo: item.inward.chamberNo, floorName: item.inward.floorName, floorNo: item.inward.floorNo, stackName: item.inward.stackName, stackNo: item.inward.stackNo }]).map((a: any) => formatLocation(a, item.inward._id)).join(', ')} (Available Weight: {(Number(remainingQtyDb) || 0).toFixed(2)} KG)
              </span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 bg-slate-50 p-3 rounded-md border border-slate-100">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Receipt Number</label>
                <div className="text-sm font-medium text-slate-800">{item.inward.receiptNumber || item.inward.receiptNo || '-'}</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">LOT No.</label>
                <div className="text-sm font-medium text-slate-800">{item.inward.lotNo || '-'}</div>
              </div>
            </div>

            {isMultiStack ? (
              <div className="mb-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50/40 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
                  <h5 className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                    Select Stack for Outward
                  </h5>
                  <div className="flex gap-4">
                    <span className="text-xs font-semibold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full flex items-center">
                      {item.inward.availableAllocations.length} Stacks Available
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {item.inward.availableAllocations.map((alloc: any) => {
                    const allocKey = `${alloc.chamberName || alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
                    const stackSel = item.stackSelections?.[allocKey] || { selected: false, outwardWeight: alloc.availableQty, bagsCount: alloc.bagsCount, jin: 0, mixed: 0 };
                    const warehouseName = item.inward.warehouseId?.name || 'Warehouse';
                    const locationLabel = `${warehouseName} → ${alloc.chamberName || formatChamberName(null, alloc.chamberNo)} / ${alloc.floorName || formatFloorName(null, alloc.floorNo)} / ${alloc.stackName || `Stack ${alloc.stackNo}`}`;

                    return (
                      <div key={allocKey} className={`p-3 rounded-md border transition-all ${stackSel.selected ? 'bg-white border-indigo-400 shadow-2xs ring-1 ring-indigo-300' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={stackSel.selected || false}
                              onChange={(e) => handleStackSelectionChange(item.inwardId, allocKey, 'selected', e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="font-bold text-sm text-slate-800">{locationLabel}</span>
                          </label>
                          <div className="text-xs font-semibold text-slate-700 flex gap-3 pl-6 sm:pl-0">
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Available Qty: <strong className="text-indigo-700">{alloc.availableQty.toFixed(2)} KG</strong>
                            </span>
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Bags: <strong className="text-slate-800">{alloc.bagsCount}</strong>
                            </span>
                          </div>
                        </div>

                        {stackSel.selected && (
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-blue-700">Weight (KG) *</label>
                              <ColdNumberInput
                                required
                                min="0"
                                max={alloc.availableQty}
                                step="0.01"
                                value={stackSel.outwardWeight ?? ''}
                                onChange={(val) => handleStackSelectionChange(item.inwardId, allocKey, 'outwardWeight', val ? Number(val) : null)}
                                placeholder={`Max ${alloc.availableQty} KG`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'large')}</label>
                              <ColdNumberInput
                                min="0"
                                value={stackSel.bagsCount ?? ''}
                                onChange={(val) => handleStackSelectionChange(item.inwardId, allocKey, 'bagsCount', val ? Number(val) : null)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'small')}</label>
                              <ColdNumberInput
                                min="0"
                                value={stackSel.jin ?? ''}
                                onChange={(val) => handleStackSelectionChange(item.inwardId, allocKey, 'jin', val ? Number(val) : null)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'mixed')}</label>
                              <ColdNumberInput
                                min="0"
                                value={stackSel.mixed ?? ''}
                                onChange={(val) => handleStackSelectionChange(item.inwardId, allocKey, 'mixed', val ? Number(val) : null)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-indigo-200">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-green-700">Weight (KG)</label>
                    <div className="px-3 py-2 border rounded-md bg-white text-slate-700 font-bold shadow-sm">{calcNetWeight.toFixed(2)}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-green-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'total')}</label>
                    <div className="px-3 py-2 border rounded-md bg-white text-slate-700 font-bold shadow-sm">{calcTotalBags.toFixed(2)}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'weight')}</label>
                    <div className="px-3 py-2 border rounded-md bg-white text-slate-700 font-bold shadow-sm">{calcKataBharati.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-green-700">Weight (KG) *</label>
                    <ColdNumberInput required min="0" step="0.01" value={item.outwardWeight ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'outwardWeight', val ? Number(val) : null)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'large')}</label>
                    <ColdNumberInput required min="0" value={item.bagsCount ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'bagsCount', val ? Number(val) : null)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'small')}</label>
                    <ColdNumberInput min="0" value={item.jin ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'jin', val ? Number(val) : null)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'mixed')}</label>
                    <ColdNumberInput min="0" value={item.mixed ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'mixed', val ? Number(val) : null)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-green-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'total')}</label>
                    <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcTotalBags.toFixed(2)}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'weight')}</label>
                    <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcKataBharati.toFixed(2)}</div>
                  </div>
                </div>
              </>
            )}

            {/* Grading Logic UI */}
            {!item.inward.gradingApplied ? (
              <div className="mt-4 p-4 border rounded-md bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-slate-700">Apply Grading?</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={item.gradingApplied ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleItemChange(item.inwardId, 'gradingApplied', true)}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      variant={!item.gradingApplied ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleItemChange(item.inwardId, 'gradingApplied', false)}
                    >
                      No
                    </Button>
                  </div>
                </div>
                {item.gradingApplied && (
                  <div className="flex items-center gap-4">
                    <div className="text-sm flex items-center">
                      <span className="text-slate-500 mr-2">Rate:</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 inline-block h-8"
                        value={item.gradingRate}
                        onChange={(e) => handleItemChange(item.inwardId, 'gradingRate', Number(e.target.value))}
                      />
                    </div>
                    <div className="text-sm text-slate-500">
                      per {item.gradingChargeType === 'Per Bag' ? 'Bag' : 'KG'}
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      Charge: ₹{(item.gradingChargeType === 'Per Bag' ? (calcTotalBags * (item.gradingRate || 0)) : (calcNetWeight * (item.gradingRate || 0))).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 p-4 border rounded-md bg-green-50 text-green-800 flex justify-between items-center text-sm">
                <div>
                  <span className="font-semibold mr-2">Grading applied from Inward</span>
                  ({item.gradingChargeType} @ ₹{item.gradingRate})
                </div>
                <div className="font-bold">
                  Charge: ₹{(item.gradingChargeType === 'Per Bag' ? (calcTotalBags * (item.gradingRate || 0)) : (calcNetWeight * (item.gradingRate || 0))).toFixed(2)}
                </div>
              </div>
            )}

            {/* Stack QR Verification Option */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`verify-stack-${item.inwardId}`}
                      checked={item.verifyStockWithQr || false}
                      onChange={(e) => handleItemChange(item.inwardId, 'verifyStockWithQr', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor={`verify-stack-${item.inwardId}`} className="text-sm font-semibold text-slate-800 cursor-pointer select-none">
                      Verify Stock with QR
                    </label>
                  </div>

                  {item.verifyStockWithQr && (
                    <div>
                      {(() => {
                        const uniqueStacks = getUniqueInwardStacks(item.inward);
                        const verifiedCount = uniqueStacks.filter(s => item.verifiedStacks?.[s.key]).length;
                        const isAllVerified = uniqueStacks.length > 0 && verifiedCount === uniqueStacks.length;

                        if (isAllVerified) {
                          return (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                              All Stacks Verified ✓
                            </span>
                          );
                        } else {
                          return (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <AlertCircle className="w-4 h-4 mr-1 text-amber-600" />
                              Verification Pending ({verifiedCount}/{uniqueStacks.length} stacks verified)
                            </span>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>

                {item.verifyStockWithQr && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    {item.verificationError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{item.verificationError}</span>
                      </div>
                    )}

                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Required Stacks ({getUniqueInwardStacks(item.inward).length})
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {getUniqueInwardStacks(item.inward).map((stackObj) => {
                        const isVerified = !!item.verifiedStacks?.[stackObj.key];
                        return (
                          <div key={stackObj.key} className={`flex items-center justify-between p-3 rounded-md border transition-all ${isVerified ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-center space-x-2.5">
                              {isVerified ? (
                                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                              ) : (
                                <div className="w-4.5 h-4.5 rounded-full border-2 border-slate-300 shrink-0" />
                              )}
                              <div className="text-xs font-medium text-slate-800">
                                <span className="font-bold text-slate-900">{stackObj.displayName}</span>
                                {stackObj.allocatedWeight !== undefined && (
                                  <span className="text-slate-500 ml-1.5">({stackObj.allocatedWeight} {item.inward.unit || item.inward.commodityId?.unit || 'KG'})</span>
                                )}
                              </div>
                            </div>

                            {isVerified ? (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded border border-emerald-300 flex items-center gap-1">
                                Verified ✓
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setScanningStackForInwardId(item.inwardId);
                                  setScanningTargetStackKey(stackObj.key);
                                }}
                                className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 flex items-center gap-1.5 font-semibold"
                              >
                                <QrCode className="h-3.5 w-3.5 text-indigo-600" />
                                Scan Stack QR
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" variant="destructive" disabled={loading || selectedItems.length === 0}>
          {loading ? t('outward.saving') : t('outward.saveOutward')}
        </Button>
      </div>

      <OutwardQRScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScanSuccess={handleQrScanSuccess}
      />

      <StackQRScannerModal
        isOpen={!!scanningStackForInwardId}
        onClose={() => setScanningStackForInwardId(null)}
        onScanSuccess={handleStackQrScanForItem}
      />


    </form>
  );
}
