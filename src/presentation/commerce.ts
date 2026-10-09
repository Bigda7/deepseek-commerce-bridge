import type { Catalog } from "@/schemas/catalog";
import { getProductRecord } from "@/domain/catalog";
import { getEnrollmentStatus } from "@/domain/enrollment";
import { getAccessPeriod } from "@/domain/access";
import { getEnrollmentOption } from "@/domain/checkout";
import { UnknownProductError, type DomainOptions } from "@/domain/context";
import { commerceViewSchema } from "@/schemas/chat";

export function buildCommerceView(
  catalog: Catalog,
  productId: string,
  options: DomainOptions = {},
) {
  const record = getProductRecord(catalog, productId);
  if (!record) throw new UnknownProductError();
  const enrollment = getEnrollmentStatus(catalog, productId, options);
  const access = getAccessPeriod(catalog, productId, {}, options);
  const checkout = getEnrollmentOption(catalog, productId, options);
  const facts = record.product.facts;
  const warnings = [
    ...record.warnings.map((warning) => ({
      code: `field_${warning.status}`,
      field: warning.field,
      message: warning.message,
    })),
    ...enrollment.warnings,
    ...access.warnings,
    ...checkout.warnings,
  ];
  const unique = new Map(
    warnings.map((warning) => [
      `${warning.code}:${warning.field ?? ""}:${warning.message}`,
      warning,
    ]),
  );
  return commerceViewSchema.parse({
    productId,
    name: facts.name.value,
    description: facts.description.value,
    landingUrl: record.product.landingUrl,
    facts: [
      {
        label: "Live classes included",
        value: String(facts.includedClasses.value ?? "Unknown"),
        status: facts.includedClasses.status,
      },
      {
        label: "Each class",
        value:
          facts.sessionDurationMinutes.value === null
            ? "Unknown"
            : `${facts.sessionDurationMinutes.value} minutes`,
        status: facts.sessionDurationMinutes.status,
      },
      {
        label: "Coach",
        value: facts.coach.value ?? "Unknown",
        status: facts.coach.status,
      },
      {
        label: "Experience levels",
        value: facts.audience.value?.join(", ") ?? "Unknown",
        status: facts.audience.status,
      },
      {
        label: "Recurring day",
        value: facts.weekday.value ?? "Unknown",
        status: facts.weekday.status,
      },
      {
        label: "Program time zone",
        value: facts.timeZone.value ?? "Unknown",
        status: facts.timeZone.status,
      },
    ],
    price: {
      display: record.priceDisplay,
      status: facts.price.status,
      billing:
        facts.billing.value === "annual_recurring"
          ? "Annual recurring billing"
          : facts.billing.value === "one_time"
            ? "One-time payment"
            : "Payment terms unknown",
      billingStatus: facts.billing.status,
      notes: `${facts.price.notes} ${facts.billing.notes}`,
    },
    enrollment: {
      availability: enrollment.data.availability,
      freshness: enrollment.data.freshness.state,
    },
    access: access.data,
    checkout: {
      mode: checkout.data.mode,
      reviewUrl: checkout.data.url,
      freshness: checkout.data.checkoutFreshness.state,
      warnings: checkout.warnings,
    },
    warnings: [...unique.values()],
    sources: record.sources,
    checkedAt: enrollment.checkedAt,
    catalogVersion: catalog.version,
  });
}
