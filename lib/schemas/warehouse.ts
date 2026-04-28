import { z } from 'zod';

// Zod v4: z.coerce.number() correctly resolves to `number` — no preprocess needed.
export const CommoditySchema = z.object({
  name: z.string().min(2, 'Commodity name is required'),
  ratePerSqFt: z.coerce.number().positive('Rate must be greater than 0'),
  isActive: z.boolean().default(true),
});

export const WarehouseConfigSchema = z.object({
  warehouseName: z.string().min(3, 'Name is required'),
  address: z.string().min(10, 'Full address is required'),
  contactEmail: z.string().email('Invalid email address'),
  totalCapacitySqFt: z.coerce.number().positive('Capacity must be valid'),
  commodities: z.array(CommoditySchema).min(1, 'At least one commodity required'),
});

export type WarehouseConfigValues = z.infer<typeof WarehouseConfigSchema>;