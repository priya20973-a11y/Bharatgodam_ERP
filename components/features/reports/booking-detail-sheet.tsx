'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { IDetailedBooking } from '@/types/schemas';
import { Calendar, Package, MapPin, Truck, User, Info, Scale, TrendingUp, ExternalLink } from 'lucide-react';

interface BookingDetailSheetProps {
  booking: IDetailedBooking | null;
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

const DetailRow = ({
  icon: Icon,
  label,
  value,
  color = "text-slate-500",
  isEditing = false,
  inputType = 'text',
  onChange,
}: {
  icon: any;
  label: string;
  value: string | number | undefined;
  color?: string;
  isEditing?: boolean;
  inputType?: 'text' | 'date' | 'number';
  onChange?: (value: string) => void;
}) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors px-2 rounded-lg">
    <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
    <div className="flex flex-col w-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</span>
      {isEditing && onChange ? (
        <input
          type={inputType}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      ) : (
        <span className="text-sm font-semibold text-slate-900">{value || '---'}</span>
      )}
    </div>
  </div>
);

const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
  <div className="flex items-center gap-2 mt-8 mb-4 px-2">
    <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
      <Icon className="h-4 w-4" />
    </div>
    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h3>
  </div>
);

const BookingDetailSheet: React.FC<BookingDetailSheetProps> = ({ booking, isOpen, onClose, userRole = 'GUEST' }) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editableBooking, setEditableBooking] = useState<IDetailedBooking | null>(booking);
  const canEdit = ['ADMIN', 'MANAGER'].includes(userRole);

  useEffect(() => {
    setEditableBooking(booking);
    setIsEditing(false);
  }, [booking]);

  const handleFieldChange = (key: keyof IDetailedBooking, value: string) => {
    if (!editableBooking) return;
    const numericFields: Array<keyof IDetailedBooking> = ['bags', 'palaBags', 'mt', 'storageDays'];
    const updatedValue = numericFields.includes(key) ? Number(value) : value;

    setEditableBooking({
      ...editableBooking,
      [key]: updatedValue,
    } as IDetailedBooking);
  };

  const handleUpdate = async () => {
    if (!editableBooking) return;

    try {
      const response = await fetch(`/api/bookings/${editableBooking._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editableBooking),
      });

      if (!response.ok) {
        throw new Error('Unable to save changes');
      }

      toast.success('Booking details saved successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Booking update failed:', error);
      toast.error('Failed to update booking.');
    }
  };

  const handleCancel = () => {
    setEditableBooking(booking);
    setIsEditing(false);
  };

  if (!booking) return null;

  const displayBooking = isEditing && editableBooking ? editableBooking : booking;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between mt-6">
            <SheetTitle className="text-2xl font-black text-slate-900">Ledger Entry #{String(booking._id)}</SheetTitle>
            <Badge variant={booking.direction === 'INWARD' ? 'success' : 'default'} className="px-3 py-1">
              {booking.direction}
            </Badge>
          </div>
          <SheetDescription className="text-slate-500 font-medium">
            Complete high-fidelity record for Gate Pass {booking.gatePass}
          </SheetDescription>
        </SheetHeader>

        <div className="pb-12">
          {/* Section 1: Logistics Flow */}
          <SectionHeader icon={Info} title="1. Flow & Location" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <DetailRow
              icon={Calendar}
              label="Inward Date"
              value={displayBooking.date}
              isEditing={isEditing}
              inputType="date"
              onChange={(value) => handleFieldChange('date', value)}
            />
            <DetailRow
              icon={MapPin}
              label="Warehouse"
              value={displayBooking.warehouseName}
              isEditing={isEditing}
              onChange={(value) => handleFieldChange('warehouseName', value)}
            />
            <DetailRow
              icon={MapPin}
              label="Zone / Location"
              value={displayBooking.location}
              color="text-indigo-500"
              isEditing={isEditing}
              onChange={(value) => handleFieldChange('location', value)}
            />
            <DetailRow
              icon={Calendar}
              label="Created At"
              value={new Date(displayBooking.createdAt).toLocaleString()}
            />
          </div>

          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-3 px-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleUpdate}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const clientParam = booking.clientName?.trim();
                      if (clientParam) {
                        router.push(`/dashboard/reports?ledgerClient=${encodeURIComponent(clientParam)}`);
                      }
                    }}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 inline-flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Ledger in Reports
                  </button>
                </>
              )}
            </div>
          )}

          {!canEdit && (
            <div className="mt-4 px-2">
              <button
                type="button"
                onClick={() => router.push(`/dashboard/reports?ledgerClient=${encodeURIComponent(booking.clientName)}`)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 inline-flex items-center gap-2 w-full justify-center"
              >
                <ExternalLink className="h-4 w-4" />
                Open Ledger in Reports
              </button>
            </div>
          )}

          {/* Section 2: Stakeholders */}
          <SectionHeader icon={User} title="2. Stakeholders" />
          <div className="grid grid-cols-1 gap-y-1">
            <DetailRow icon={User} label="Client Name" value={displayBooking.clientName} isEditing={isEditing} onChange={(value) => handleFieldChange('clientName', value)} />
            <DetailRow icon={MapPin} label="Client Location" value={displayBooking.clientLocation} isEditing={isEditing} onChange={(value) => handleFieldChange('clientLocation', value)} />
            <DetailRow icon={User} label="Suppliers" value={displayBooking.suppliers} isEditing={isEditing} onChange={(value) => handleFieldChange('suppliers', value)} />
          </div>

          {/* Section 3: Tracking Specs */}
          <SectionHeader icon={Truck} title="3. Tracking & Specs" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <DetailRow icon={Package} label="Commodity" value={displayBooking.commodityName} color="text-emerald-500" isEditing={isEditing} onChange={(value) => handleFieldChange('commodityName', value)} />
            <DetailRow icon={Info} label="CAD No" value={displayBooking.cadNo} isEditing={isEditing} onChange={(value) => handleFieldChange('cadNo', value)} />
            <DetailRow icon={Package} label="Stack No." value={displayBooking.stackNo} isEditing={isEditing} onChange={(value) => handleFieldChange('stackNo', value)} />
            <DetailRow icon={Info} label="Lot Number" value={displayBooking.lotNo} isEditing={isEditing} onChange={(value) => handleFieldChange('lotNo', value)} />
            <DetailRow icon={Package} label="DO Number" value={displayBooking.doNumber} isEditing={isEditing} onChange={(value) => handleFieldChange('doNumber', value)} />
            <DetailRow icon={Info} label="CDF No" value={displayBooking.cdfNo} isEditing={isEditing} onChange={(value) => handleFieldChange('cdfNo', value)} />
            <DetailRow icon={Truck} label="Gate Pass" value={displayBooking.gatePass} color="text-indigo-500" isEditing={isEditing} onChange={(value) => handleFieldChange('gatePass', value)} />
            <DetailRow icon={Truck} label="Vehicle Number" value={displayBooking.vehicleNumber} isEditing={isEditing} onChange={(value) => handleFieldChange('vehicleNumber', value)} />
            <DetailRow icon={Truck} label="Transport" value={displayBooking.transportationName} isEditing={isEditing} onChange={(value) => handleFieldChange('transportationName', value)} />
            <DetailRow icon={User} label="Driver Details" value={displayBooking.driverName} isEditing={isEditing} onChange={(value) => handleFieldChange('driverName', value)} />
            <DetailRow icon={Info} label="Additional Note" value={displayBooking.note} isEditing={isEditing} onChange={(value) => handleFieldChange('note', value)} />
            <DetailRow icon={Info} label="Pass" value={displayBooking.pass} isEditing={isEditing} onChange={(value) => handleFieldChange('pass', value)} />
          </div>

          {/* Section 4: Quantities & Performance */}
          <SectionHeader icon={Scale} title="4. Scale Quantities" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <DetailRow icon={Package} label="Bags (Qty)" value={displayBooking.bags} isEditing={isEditing} inputType="number" onChange={(value) => handleFieldChange('bags', value)} />
            <DetailRow icon={Package} label="Pala Bags" value={displayBooking.palaBags} isEditing={isEditing} inputType="number" onChange={(value) => handleFieldChange('palaBags', value)} />
            <div className="col-span-2 mt-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Total Weight</p>
                  <p className="text-2xl font-black text-emerald-900">{displayBooking.mt} <span className="text-sm">MT</span></p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Billing Active</p>
                <p className="text-sm font-bold text-emerald-700">{displayBooking.storageDays} Days</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BookingDetailSheet;
