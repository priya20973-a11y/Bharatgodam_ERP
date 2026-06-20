'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';
import { calculateInvoiceTotal } from '@/lib/pricing-engine';

// Type definition for booking form values
interface LogisticsBookingValues {
  customerName: string;
  mobileNumber: string;
  commodity: string;
  truckNumber: string;
  weight: number;
  startDate: string;
  endDate: string;
}

export async function fetchFilteredBookings(filters: {
  page: number;
  limit: number;
  commodity?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const db = await getDb();
  const skip = (filters.page - 1) * filters.limit;

  // Build query
  const query: any = { userEmail: session.user.email };
  if (filters.commodity && filters.commodity !== 'ALL') {
    query.commodity = filters.commodity;
  }

  // Fetch bookings with pagination
  const bookings = await db.collection('bookings')
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(filters.limit)
    .toArray();

  // Get total count for pagination
  const totalCount = await db.collection('bookings').countDocuments(query);

  // Calculate totals for current filter
  const totals = await db.collection('bookings').aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalMt: { $sum: '$weightTons' },
        totalBags: { $sum: { $ifNull: ['$bagsCount', 0] } }
      }
    }
  ]).toArray();

  const totalMt = totals[0]?.totalMt || 0;
  const totalBags = totals[0]?.totalBags || 0;

  // Format bookings for client
  const formattedBookings = bookings.map(booking => {
    const formatDate = (date: any) => {
      if (!date) return new Date().toISOString();
      try {
        if (date instanceof Date) return date.toISOString();
        const parsedDate = new Date(date);
        return isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    return {
      id: booking._id.toString(),
      customerName: booking.customerName || 'Unknown Customer',
      commodity: booking.commodity || 'Unknown',
      weightTons: booking.weightTons || 0,
      truckNumber: booking.truckNumber || 'Unknown',
      startDate: formatDate(booking.startDate),
      endDate: formatDate(booking.endDate),
      status: booking.status || 'UNKNOWN',
      createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : new Date().toISOString(),
    };
  });

  return {
    bookings: formattedBookings,
    totalCount,
    totalPages: Math.ceil(totalCount / filters.limit),
    totalMt,
    totalBags,
  };
}

export async function fetchCommodityOptions() {
  try {
    const db = await getDb();
    const commodities = await db.collection('commodities')
      .find({}, { projection: { name: 1, userId: 1 } })
      .sort({ name: 1 })
      .toArray();

    const userIds = commodities.map(c => c.userId).filter((id): id is any => !!id);
    const uniqueUserIds = Array.from(new Set(userIds.map(id => id.toString()))).map(id => {
      try { return new ObjectId(id); } catch { return id; }
    });
    const users = uniqueUserIds.length > 0
      ? await db.collection('users').find({ _id: { $in: uniqueUserIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray()
      : [];
    const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

    return [
      { label: 'All Commodities', value: 'ALL' },
      ...commodities.map(c => {
        const userId = c.userId?.toString();
        const userInfo = userId ? userMap.get(userId) : null;
        const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (c.userId ? 'Unknown' : 'System');
        return {
          label: c.name,
          value: c.name,
          wspName
        };
      })
    ];
  } catch (error) {
    console.error('Error fetching commodities:', error);
    return [{ label: 'All Commodities', value: 'ALL' }];
  }
}

export async function createBookingWithInvoice(formData: LogisticsBookingValues) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const db = await getDb();

  // 1. SECURE FETCH: Get the live, Owner-defined Master Rates
  const masterConfig = await db.collection('warehouse_config').findOne({});
  if (!masterConfig) throw new Error('Warehouse configuration missing. Cannot calculate price.');

  // Look up "Master Configuration" matching the Commodity type selection
  const targetCommodity = masterConfig.commodities.find(
    (c: any) => c.name.toUpperCase() === formData.commodity.toUpperCase()
  );

  // If there's a custom rate for this commodity, use it. Otherwise, use a default base rate.
  const ratePerTon = targetCommodity ? targetCommodity.ratePerSqFt : 12.50;

  // 2. SERVER-SIDE MATH: Calculate Final Bill securely using Weight (Tons)
  const invoiceCalculations = calculateInvoiceTotal(
    formData.startDate,
    formData.endDate,
    formData.weight,  
    ratePerTon        
  );

  // 3. TRANSACTION / SAVE: Lock the booking into history
  const newBooking = {
    userId: (session.user as any).id,
    userEmail: session.user.email,
    customerName: formData.customerName,
    mobileNumber: formData.mobileNumber,
    commodity: formData.commodity,
    truckNumber: formData.truckNumber,
    weightTons: formData.weight,
    startDate: formData.startDate,
    endDate: formData.endDate,
    status: 'PENDING_APPROVAL',
    createdAt: new Date(),
  };

  const bookingRes = await db.collection('bookings').insertOne(newBooking);

  // 4. Generate the immutable formal invoice
  const formalInvoice = {
    bookingId: bookingRes.insertedId,
    clientEmail: session.user.email,
    customerName: formData.customerName,
    commodity: formData.commodity,
    ...invoiceCalculations, // Locks in rateApplied, subtotal, totalAmount
    
    // Initialize payment fields
    paidAmount: 0,
    pendingAmount: invoiceCalculations.totalAmount,
    
    status: 'UNPAID',
    generatedAt: new Date(),
  };

  // DISABLED: Invoice auto-generation stopped as per user request
  // await db.collection('invoices').insertOne(formalInvoice);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/invoices');

  return { success: true, invoice: formalInvoice };
}
