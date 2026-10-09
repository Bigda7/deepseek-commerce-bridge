import { z } from "zod";
import { productIdSchema, sourceSchema } from "@/schemas/catalog";

export const assistantInputSchema = z
  .strictObject({
    messages: z
      .array(
        z.strictObject({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(
    ({ messages }) => messages.at(-1)?.role === "user",
    "The last message must be from the user",
  )
  .refine(
    ({ messages }) =>
      messages.reduce((sum, message) => sum + message.content.length, 0) <=
      12000,
    "Conversation input is too large",
  );

const httpsLink = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
export const warningSchema = z.object({
  code: z.string(),
  field: z.string().optional(),
  message: z.string(),
});
export const commerceViewSchema = z.object({
  productId: productIdSchema,
  name: z.string(),
  description: z.string(),
  landingUrl: httpsLink,
  facts: z.array(
    z.object({ label: z.string(), value: z.string(), status: z.string() }),
  ),
  price: z.object({
    display: z.string(),
    status: z.string(),
    billing: z.string(),
    billingStatus: z.string(),
    notes: z.string(),
  }),
  enrollment: z.object({
    availability: z.enum(["open", "closed", "unknown"]),
    freshness: z.string(),
  }),
  access: z.object({
    state: z.string(),
    startDate: z.string().nullable(),
    endDateExclusive: z.string().nullable(),
    entitlementVerified: z.literal(false),
  }),
  checkout: z.object({
    mode: z.enum(["observed_official_link", "blocked"]),
    reviewUrl: httpsLink.nullable(),
    freshness: z.string(),
    warnings: z.array(warningSchema),
  }),
  warnings: z.array(warningSchema),
  sources: z.array(sourceSchema),
  checkedAt: z.iso.datetime(),
  catalogVersion: z.string(),
});
export type CommerceView = z.infer<typeof commerceViewSchema>;
export type ConversationMessage = z.infer<
  typeof assistantInputSchema
>["messages"][number];
export const chatResponseSchema = z.object({
  status: z.string(),
  text: z.string().nullable().optional(),
  message: z.string().optional(),
  providerRequests: z.number().int().nonnegative().optional(),
  requestedModel: z.string().optional(),
  responseOrigin: z.literal("application_clarification").optional(),
  mode: z.enum(["live_deepseek", "offline_test_fixture"]).optional(),
  catalogVersion: z.string().optional(),
  view: commerceViewSchema.optional(),
  toolNotices: z
    .array(
      z.object({
        name: z.string(),
        status: z.string(),
        message: z.string().optional(),
      }),
    )
    .optional(),
  toolWarnings: z.array(warningSchema).optional(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export const sessionResponseSchema = z.object({
  status: z.string(),
  data: z.object({
    referenceDate: z.string(),
    referenceWeekday: z.string(),
    candidates: z.array(
      z.object({
        programDate: z.string(),
        status: z.literal("tentative"),
        startsAt: z.string().nullable(),
        userLocalStart: z
          .object({ date: z.string(), time: z.string(), timeZone: z.string() })
          .nullable(),
      }),
    ),
  }),
  warnings: z.array(warningSchema),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export const checkoutResponseSchema = z.object({
  status: z.string(),
  data: z.object({
    mode: z.enum(["approved_hosted_link", "blocked"]),
    url: httpsLink.nullable(),
    paymentConfirmed: z.literal(false),
    accessGranted: z.literal(false),
  }),
  warnings: z.array(warningSchema),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
