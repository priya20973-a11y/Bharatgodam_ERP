import BookingForm from '@/components/features/bookings/booking-form';
import BookingsTable from '@/components/features/bookings/bookings-table';
import BookingFilter from '@/components/features/bookings/booking-filter';
import { Toaster } from 'react-hot-toast';
import { fetchCommodities } from '@/app/actions/commodities';
import { fetchFilteredBookings, fetchCommodityOptions } from '@/app/actions/booking';
import { MongoCommodity } from '@/lib/validations/commodity';
import { redirect } from 'next/navigation';

interface BookingsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  // Await searchParams as it's now a Promise in Next.js 15+
  const params = await searchParams;
  const pageParam = params.page ? (Array.isArray(params.page) ? params.page[0] : params.page) : undefined;
  const page = pageParam ? parseInt(pageParam) : 1;
  const commodityParam = params.commodity ? (Array.isArray(params.commodity) ? params.commodity[0] : params.commodity) : undefined;
  const commodity = commodityParam || 'ALL';

  // Validate page number
  if (page < 1) {
    redirect('/dashboard/bookings');
  }

  // Fetch data in parallel
  const [commoditiesResult, bookingsResult, commodityOptions] = await Promise.all([
    fetchCommodities().catch(() => [] as MongoCommodity[]),
    fetchFilteredBookings({ page, limit: 20, commodity }),
    fetchCommodityOptions()
  ]);

  const commodities = commoditiesResult;
  const { bookings, totalPages, totalMt, totalBags } = bookingsResult;

  // Handle invalid page numbers
  if (page > totalPages && totalPages > 0) {
    redirect('/dashboard/bookings');
  }

  return (
    <div className="w-full space-y-8">
      <Toaster position="top-right" />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Warehouse Bookings
        </h1>
        <p className="text-slate-500 mt-1">
          Manage warehouse space reservations and track booking history.
        </p>
      </div>

      {/* Booking Form Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Create New Booking</h2>
        <BookingForm commodities={commodities} />
      </div>

      {/* Bookings List Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Booking History</h2>
          <div className="text-sm text-slate-500">
            {bookings.length} bookings • {totalMt.toFixed(2)} MT total
          </div>
        </div>

        <BookingFilter
          commodities={commodityOptions}
          currentCommodity={commodity}
          currentPage={page}
          totalPages={totalPages}
        />

        <BookingsTable
          bookings={bookings}
          totalMt={totalMt}
          totalBags={totalBags}
        />
      </div>
    </div>
  );
}
