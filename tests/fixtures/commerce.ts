import observations from "../../data/observations/victory-skating.json";
import emptyOverrides from "../../data/overrides/business-approved.json";
import { normalizeCatalog } from "@/ingestion/normalize-catalog";
import type { FactKey, ProductFacts } from "@/schemas/catalog";

export const productId = "vsa-annual-online-ballet";
export const fixedNow = "2026-10-07T12:00:00.000Z";
export const fixedClock = () => new Date(fixedNow);
type Values = Partial<{ [K in FactKey]: ProductFacts[K]["value"] }>;

export function observedCatalog() {
  return normalizeCatalog(observations, emptyOverrides);
}

export function approvedCatalog(
  values: Values,
  approvedAt = "2026-10-07T11:59:00.000Z",
) {
  return normalizeCatalog(observations, {
    schemaVersion: 1,
    version: "test-fixture-only",
    changes: [
      {
        id: "test-business-policy",
        productId,
        approval: {
          approvedBy: "Automated test fixture only",
          approvedAt,
          reason:
            "Hypothetical test configuration; no actual business approval.",
        },
        facts: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            {
              value,
              notes: "Test fixture only; not real business-approved terms.",
            },
          ]),
        ),
      },
    ],
  });
}

export const scheduleValues: Values = {
  timeZone: "America/New_York",
  localStartTime: "14:00",
  dstPolicy: "follow_canonical_zone",
  exceptions: [],
};
export const accessValues: Values = {
  accessStartRule: { trigger: "payment_confirmed" },
  accessEndRule: {
    unit: "calendar_year",
    years: 1,
    boundary: "exclusive",
    leapDayRule: "clamp_to_february_28",
  },
};
export const checkoutValues: Values = {
  ...accessValues,
  enrollment: "open",
  price: { amountMinor: 17900, currency: "USD" },
  billing: "annual_recurring",
  commercialConsistency: "resolved",
  additionalCharges: "No mandatory additional charges in this fixture.",
  cancellationPolicy: "Fixture cancellation terms.",
  refundPolicy: "Fixture refund terms.",
  checkoutUrl: "https://buy.stripe.com/fZudR90Q3cxm69k8sTdMM2n",
  checkoutTitle: "1-Year Ballet Club (weekly classes)",
};
