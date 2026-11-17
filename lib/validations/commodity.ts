import { z } from 'zod';

export const CommoditySchema = z.object({
  name: z.string().min(2, 'Commodity name must be at least 2 characters').toUpperCase(),
  variety: z.string().optional(),
  baseRate: z.coerce.number().positive('Base Rate must be greater than 0'),
  unit: z.string().min(1, 'Unit is required').default('MT'),
  category: z.string().min(2, 'Category is required'),
});

// Infer the Typescript shape from Zod
export type CommodityValues = z.infer<typeof CommoditySchema>;

// The standard Object structure returning from Next.js server actions (cleaned of BSON ObjectIds)
export type MongoCommodity = {
  _id: string;
  name: string;
  variety?: string;
  baseRate: number;
  unit: string;
  category: string;
  updatedAt: string;
  createdAt: string;
};
