import { z } from "zod";
import { productIdSchema } from "@/schemas/catalog";

export const productSearchSchema = z.strictObject({
  q: z.string().trim().max(500).optional(),
  businessId: productIdSchema.optional(),
});
