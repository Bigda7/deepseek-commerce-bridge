import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
export const productIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const dateOnly = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "HTTPS is required");

export const approvalSchema = z.strictObject({
  approvedBy: text,
  approvedAt: timestamp,
  reason: text,
});

export const sourceSchema = z
  .strictObject({
    id: productIdSchema,
    title: text,
    kind: z.enum([
      "assignment",
      "website_observation",
      "checkout_observation",
      "business_approval",
    ]),
    location: text,
    observedOn: dateOnly,
    observedAt: timestamp.nullable(),
    approval: approvalSchema.nullable(),
  })
  .superRefine((source, ctx) => {
    if ((source.kind === "business_approval") !== (source.approval !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Business approvals require attributable approval metadata",
      });
    }
    if (
      source.observedAt &&
      source.observedAt.slice(0, 10) !== source.observedOn
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["observedAt"],
        message: "Observation date and timestamp must agree",
      });
    }
  });

export function factSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .strictObject({
      value: valueSchema.nullable(),
      status: z.enum([
        "confirmed",
        "observed",
        "unknown",
        "conflicting",
        "stale",
      ]),
      sourceIds: z.array(productIdSchema).max(20),
      notes: text,
    })
    .superRefine((fact, ctx) => {
      const unresolved =
        fact.status === "unknown" || fact.status === "conflicting";
      const value = "value" in fact ? fact.value : undefined;
      if (value === undefined || unresolved !== (value === null)) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message:
            "Unresolved facts must be null; known facts must have a value",
        });
      }
      if (fact.status !== "unknown" && fact.sourceIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceIds"],
          message: "Known or conflicting facts require source evidence",
        });
      }
    });
}

const moneySchema = z.strictObject({
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(["USD", "EUR", "GBP"]),
});
const timeZone = z.string().refine((value) => {
  try {
    return (
      (value.includes("/") || value === "UTC") &&
      Boolean(new Intl.DateTimeFormat("en", { timeZone: value }))
    );
  } catch {
    return false;
  }
}, "A recognized IANA time zone is required");

export const productFactsSchema = z.strictObject({
  name: factSchema(text),
  description: factSchema(text),
  delivery: factSchema(z.literal("online")),
  format: factSchema(z.literal("group")),
  programModel: factSchema(z.literal("ongoing")),
  audience: factSchema(
    z
      .array(z.enum(["beginner", "recreational", "advanced", "professional"]))
      .min(1),
  ),
  coach: factSchema(text),
  entitlementYears: factSchema(z.literal(1)),
  includedClasses: factSchema(z.number().int().positive()),
  sessionDurationMinutes: factSchema(z.number().int().positive()),
  requirements: factSchema(z.array(text).min(1)),
  price: factSchema(moneySchema),
  billing: factSchema(z.enum(["annual_recurring", "one_time"])),
  commercialConsistency: factSchema(z.enum(["resolved", "unresolved"])),
  additionalCharges: factSchema(text),
  cancellationPolicy: factSchema(text),
  refundPolicy: factSchema(text),
  weekday: factSchema(
    z.enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]),
  ),
  advertisedTimes: factSchema(z.array(text).min(1)),
  localStartTime: factSchema(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  timeZone: factSchema(timeZone),
  dstPolicy: factSchema(text),
  exceptions: factSchema(z.array(dateOnly)),
  enrollment: factSchema(z.enum(["open", "closed"])),
  accessStartRule: factSchema(
    z.union([
      text,
      z.strictObject({
        trigger: z.enum(["payment_confirmed", "enrollment_confirmed"]),
      }),
    ]),
  ),
  accessEndRule: factSchema(
    z.union([
      text,
      z.strictObject({
        unit: z.literal("calendar_year"),
        years: z.literal(1),
        boundary: z.literal("exclusive"),
        leapDayRule: z.enum(["clamp_to_february_28", "march_1"]),
      }),
    ]),
  ),
  checkoutUrl: factSchema(httpsUrl),
  checkoutTitle: factSchema(text),
});

export const productSchema = z.strictObject({
  id: productIdSchema,
  businessId: productIdSchema,
  kind: z.literal("annual-online-group-ballet"),
  landingUrl: httpsUrl,
  facts: productFactsSchema,
});

const catalogShape = z.strictObject({
  schemaVersion: z.literal(1),
  version: text,
  updatedOn: dateOnly,
  businesses: z
    .array(
      z.strictObject({
        id: productIdSchema,
        name: text,
        contextualAliases: z.array(text).min(1),
      }),
    )
    .min(1),
  sources: z.array(sourceSchema).min(1),
  products: z.array(productSchema).min(1),
  observations: z.array(
    z.strictObject({
      id: productIdSchema,
      productId: productIdSchema,
      sourceIds: z.array(productIdSchema).min(1),
      kind: z.enum([
        "crossed_out_price",
        "per_class_marketing",
        "separate_offer",
        "commercial_discrepancy",
      ]),
      text,
    }),
  ),
});

export const catalogSchema = catalogShape.superRefine((catalog, ctx) => {
  for (const key of [
    "businesses",
    "sources",
    "products",
    "observations",
  ] as const) {
    const ids = catalog[key].map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "IDs must be unique",
      });
    }
  }
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));
  const checkSources = (ids: string[], path: (string | number)[]) => {
    for (const id of ids) {
      if (!sources.has(id))
        ctx.addIssue({
          code: "custom",
          path,
          message: `Unknown source: ${id}`,
        });
    }
  };
  catalog.products.forEach((product, index) => {
    if (
      !catalog.businesses.some((business) => business.id === product.businessId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["products", index, "businessId"],
        message: "Unknown business",
      });
    }
    Object.entries(product.facts).forEach(([key, fact]) => {
      const path = ["products", index, "facts", key];
      checkSources(fact.sourceIds, [...path, "sourceIds"]);
      if (
        fact.status === "confirmed" &&
        !fact.sourceIds.some((id) => {
          const kind = sources.get(id)?.kind;
          return kind === "assignment" || kind === "business_approval";
        })
      ) {
        ctx.addIssue({
          code: "custom",
          path,
          message:
            "Confirmed facts require assignment or business approval evidence",
        });
      }
    });
  });
  catalog.observations.forEach((observation, index) => {
    checkSources(observation.sourceIds, ["observations", index, "sourceIds"]);
    if (
      !catalog.products.some((product) => product.id === observation.productId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["observations", index, "productId"],
        message: "Unknown product",
      });
    }
  });
});

export type Catalog = z.infer<typeof catalogSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductFacts = z.infer<typeof productFactsSchema>;
export type FactKey = keyof ProductFacts;

export const overridesSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    version: text,
    changes: z.array(
      z.strictObject({
        id: productIdSchema,
        productId: productIdSchema,
        approval: approvalSchema,
        facts: z
          .partialRecord(
            productFactsSchema.keyof(),
            z.strictObject({ value: z.unknown(), notes: text }),
          )
          .refine(
            (facts) => Object.keys(facts).length > 0,
            "At least one field is required",
          ),
      }),
    ),
  })
  .superRefine((overrides, ctx) => {
    if (
      new Set(overrides.changes.map((change) => change.id)).size !==
      overrides.changes.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "Override IDs must be unique",
      });
    }
  });

export type CatalogOverrides = z.infer<typeof overridesSchema>;
