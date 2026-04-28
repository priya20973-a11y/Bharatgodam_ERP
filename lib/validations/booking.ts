import { z } from 'zod';

// Zod v4: z.coerce.number() correctly infers as `number` — no preprocess needed.
export const DetailedLogisticsSchema = z.object({
  // 1. Flow & Location
  direction: z.enum(['INWARD', 'OUTWARD'], { error: 'Please select flow direction' }),
  date: z.string().min(1, 'Date is required'),
  warehouseName: z.string().min(1, "Please select a warehouse"),
  location: z.string().min(2, 'Warehouse Location is required'),

  // 2. Stakeholders
  clientName: z.string().min(2, 'Client Name is required'),
  clientLocation: z.string().optional(),
  suppliers: z.string().optional(),

  // 3. Tracking Specs
  commodityName: z.string().min(2, 'Please select a commodity'),
  cadNo: z.string().optional(),
  stackNo: z.string().optional(),
  lotNo: z.string().optional(),
  doNumber: z.string().optional(),
  cdfNo: z.string().optional(),

  // 4. Gate & Quantities
  gatePass: z.string().min(2, 'Gate Pass No. is required'),
  pass: z.string().optional(),
  bags: z.coerce.number().min(0, 'Quantity cannot be negative'),
  mt: z.coerce.number().min(0.1, 'Minimum 0.1 MT required'),
  palaBags: z.coerce.number().min(0, 'Invalid pala bags').default(0),

  // 5. Billing Configuration
  storageDays: z.coerce.number().min(1, 'Minimum 1 day of storage').default(1),
});

export type DetailedLogisticsValues = z.infer<typeof DetailedLogisticsSchema>;
