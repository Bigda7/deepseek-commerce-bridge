import { z } from "zod";
import { productIdSchema } from "@/schemas/catalog";

export const calendarDateSchema = z.iso.date().refine((date) => {
  const year = Number(date.slice(0, 4));
  return year >= 1900 && year <= 2200;
}, "Use a full calendar date between 1900 and 2200");

export const ianaTimeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      return (
        (value.includes("/") || value === "UTC") &&
        Boolean(new Intl.DateTimeFormat("en", { timeZone: value }))
      );
    } catch {
      return false;
    }
  }, "A recognized IANA time zone is required");

export const sessionQuerySchema = z.strictObject({
  referenceDate: calendarDateSchema,
  userTimeZone: ianaTimeZoneSchema.optional(),
  limit: z.coerce.number().int().min(1).max(12).default(3),
});

export const accessQuerySchema = z.strictObject({
  activationDate: calendarDateSchema.optional(),
  activationEvent: z
    .enum(["payment_confirmed", "enrollment_confirmed"])
    .optional(),
});

export const checkoutRequestSchema = z.strictObject({
  productId: productIdSchema,
  intent: z.literal("enroll"),
});

export const domainPolicySchema = z.strictObject({
  enrollmentMaxAgeSeconds: z.number().int().positive().max(86400),
  checkoutMaxAgeSeconds: z.number().int().positive().max(604800),
  commercialMaxAgeSeconds: z.number().int().positive().max(604800),
  checkoutDestinations: z.array(
    z.strictObject({
      productId: productIdSchema,
      url: z.url().refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }, "Use an exact HTTPS destination without credentials, query parameters or fragments"),
      productTitle: z.string().trim().min(1),
    }),
  ),
});

export type SessionQuery = z.infer<typeof sessionQuerySchema>;
export type AccessQuery = z.infer<typeof accessQuerySchema>;
export type DomainPolicy = z.infer<typeof domainPolicySchema>;
