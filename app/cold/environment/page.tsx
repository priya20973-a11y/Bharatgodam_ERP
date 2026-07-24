'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

interface WarehouseOption {
  id: string;
  name: string;
  chambers: {
    chamberNo: number;
    name: string;
    floors: { floorNo: number; name: string }[];
  }[];
}

interface RecordItem {
  _id: string;
  warehouseId: string;
  chamberNo: number;
  floorNo: number;
  temperature: number;
  moisture: number;
  recordedAt: string;
  notes?: string;
  userEmail?: string;
}

const csvHeaders = ['Warehouse', 'Chamber', 'Floor', 'Temperature', 'Moisture', 'Recorded At', 'Notes', 'Entered By'];

function formatCsvValue(value: string | number | null | undefined) {
  if (value == null) return '';
  const cleaned = String(value).replace(/"/g, '""');
  return `"${cleaned}"`;
}

export default function ColdEnvironmentPage() {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [chamberNo, setChamberNo] = useState('');
  const [floorNo, setFloorNo] = useState('');
  const [temperature, setTemperature] = useState('');
  const [moisture, setMoisture] = useState('');
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === warehouseId) || warehouses[0] || null,
    [warehouseId, warehouses]
  );

  const selectedChamber = useMemo(() => {
    if (!selectedWarehouse) return null;
    if (chamberNo === '') {
      return selectedWarehouse.chambers[0] || null;
    }
    return selectedWarehouse.chambers.find((chamber) => chamber.chamberNo === Number(chamberNo)) || selectedWarehouse.chambers[0] || null;
  }, [selectedWarehouse, chamberNo]);

  const maybeInitializeDefaults = useCallback((warehousesData: WarehouseOption[]) => {
    if (warehousesData.length === 0) return;
    if (!warehouseId) {
      const firstWarehouse = warehousesData[0];
      setWarehouseId(firstWarehouse.id);
      setChamberNo(String(firstWarehouse.chambers?.[0]?.chamberNo ?? ''));
      setFloorNo(String(firstWarehouse.chambers?.[0]?.floors?.[0]?.floorNo ?? ''));
    }
  }, [warehouseId]);

  const loadData = useCallback(async (onlyRecords = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (warehouseId) params.set('warehouseId', warehouseId);
      if (!onlyRecords) {
        if (chamberNo !== '') params.set('chamberNo', chamberNo);
        if (floorNo !== '') params.set('floorNo', floorNo);
      }

      const response = await fetch(`/api/cold/environment?${params.toString()}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Failed to load environment records');
        return;
      }

      if (!onlyRecords) {
        setWarehouses(data.warehouses || []);
        maybeInitializeDefaults(data.warehouses || []);
      }
      setRecords(data.records || []);
    } catch (fetchError) {
      console.error(fetchError);
      setError('Failed to load environment records');
    } finally {
      setLoading(false);
    }
  }, [warehouseId, chamberNo, floorNo, maybeInitializeDefaults]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!active) return;
      await loadData();
    };

    init();

    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!warehouseId) return;

    let active = true;

    const refresh = async () => {
      if (!active) return;
      await loadData(true);
    };

    refresh();

    return () => {
      active = false;
    };
  }, [loadData, warehouseId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!warehouseId || chamberNo === '' || floorNo === '' || temperature === '' || moisture === '' || !recordedAt) {
      setError('Please fill all required fields.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/cold/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          chamberNo: Number(chamberNo),
          floorNo: Number(floorNo),
          temperature: parseFloat(temperature),
          moisture: parseFloat(moisture),
          recordedAt,
          notes,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Failed to save record');
        return;
      }

      setTemperature('');
      setMoisture('');
      setNotes('');
      await loadData(true);
    } catch (submitError) {
      console.error(submitError);
      setError('Failed to save record');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (records.length === 0) return;

    const header = csvHeaders.join(',');
    const rows = records.map((record) => {
      const warehouseName = warehouses.find((warehouse) => warehouse.id === record.warehouseId)?.name || '';
      return [
        warehouseName,
        record.chamberNo,
        record.floorNo,
        record.temperature,
        record.moisture,
        format(new Date(record.recordedAt), 'yyyy-MM-dd HH:mm'),
        record.notes || '',
        record.userEmail || '',
      ]
        .map(formatCsvValue)
        .join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cold-environment-records-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cold Environment Records</h1>
          <p className="text-sm text-slate-500">Record temperature and moisture per warehouse, chamber and floor.</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={records.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Add New Environment Record</h2>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Warehouse</span>
                <select
                  value={warehouseId}
                  onChange={(event) => {
                    const selectedWarehouseId = event.target.value;
                    setWarehouseId(selectedWarehouseId);
                    const selected = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
                    setChamberNo(String(selected?.chambers?.[0]?.chamberNo ?? ''));
                    setFloorNo(String(selected?.chambers?.[0]?.floors?.[0]?.floorNo ?? ''));
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Chamber</span>
                <select
                  value={chamberNo}
                  onChange={(event) => {
                    const selectedChamberNo = event.target.value;
                    setChamberNo(selectedChamberNo);
                    const selectedChamber = selectedWarehouse?.chambers.find((chamber) => String(chamber.chamberNo) === selectedChamberNo);
                    setFloorNo(String(selectedChamber?.floors?.[0]?.floorNo ?? ''));
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select Chamber</option>
                  {selectedWarehouse?.chambers.map((chamber) => (
                    <option key={chamber.chamberNo} value={chamber.chamberNo}>
                      {chamber.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Floor</span>
                <select
                  value={floorNo}
                  onChange={(event) => setFloorNo(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select Floor</option>
                  {selectedChamber?.floors.map((floor) => (
                    <option key={floor.floorNo} value={floor.floorNo}>
                      {floor.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Recorded Date & Time</span>
                <input
                  type="datetime-local"
                  value={recordedAt}
                  onChange={(event) => setRecordedAt(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Temperature (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Moisture (%)</span>
                <input
                  type="number"
                  step="0.1"
                  value={moisture}
                  onChange={(event) => setMoisture(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  required
                />
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                placeholder="Optional notes"
              />
            </label>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus className="h-4 w-4" />
              Save Record
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold">Recent Records</h2>
              <p className="text-sm text-slate-500">Latest temperature and moisture entries.</p>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-sm text-slate-500">Loading...</div>
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-slate-500">No records found.</div>
            ) : (
              <div className="space-y-3">
                {records.map((record) => (
                  <div key={record._id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm text-slate-500">{`Chamber ${record.chamberNo} / Floor ${record.floorNo}`}</div>
                        <div className="text-base font-semibold text-slate-900">{format(new Date(record.recordedAt), 'yyyy-MM-dd HH:mm')}</div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        <div>Temp: {record.temperature}°C</div>
                        <div>Moisture: {record.moisture}%</div>
                      </div>
                    </div>
                    {record.notes && <p className="mt-3 text-sm text-slate-600">Notes: {record.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
