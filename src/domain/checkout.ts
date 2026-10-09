import type { Catalog, FactKey } from "@/schemas/catalog";
import { checkoutRequestSchema } from "@/schemas/commerce";
import {
  businessApproved,
  domainContext,
  domainResult,
  factFreshness,
  factWarnings,
  type DomainContext,
  type DomainOptions,
  type Warning,
} from "@/domain/context";
import { enrollmentState } from "@/domain/enrollment";

const fields: FactKey[] = [
  "checkoutUrl",
  "checkoutTitle",
  "price",
  "billing",
  "commercialConsistency",
  "additionalCharges",
  "cancellationPolicy",
  "refundPolicy",
  "enrollment",
  "accessStartRule",
  "accessEndRule",
];

function destinationState(context: DomainContext) {
  const facts = context.product.facts;
  const freshness = factFreshness(
    context,
    facts.checkoutUrl,
    context.policy.checkoutMaxAgeSeconds,
  );
  const mapped = context.policy.checkoutDestinations.some(
    (destination) =>
      destination.productId === context.product.id &&
      destination.url === facts.checkoutUrl.value &&
      destination.productTitle === facts.checkoutTitle.value,
  );
  const titleFreshness = factFreshness(
    context,
    facts.checkoutTitle,
    context.policy.checkoutMaxAgeSeconds,
  );
  const usable =
    mapped &&
    freshness.state === "fresh" &&
    titleFreshness.state === "fresh" &&
    (facts.checkoutUrl.status === "observed" ||
      facts.checkoutUrl.status === "confirmed") &&
    (facts.checkoutTitle.status === "observed" ||
      facts.checkoutTitle.status === "confirmed");
  return { mapped, usable, freshness, titleFreshness };
}

export function getEnrollmentOption(
  catalog: Catalog,
  productId: string,
  options: DomainOptions = {},
) {
  const context = domainContext(catalog, productId, options);
  const facts = context.product.facts;
  const destination = destinationState(context);
  const enrollment = enrollmentState(context);
  const warnings = factWarnings(context.product, fields);
  const canReview = destination.usable && enrollment.availability !== "closed";
  if (!destination.mapped)
    warnings.push({
      code: "checkout_destination_mismatch",
      message:
        "The configured URL and checkout title do not match the product-specific destination allowlist.",
    });
  if (
    destination.freshness.state !== "fresh" ||
    destination.titleFreshness.state !== "fresh"
  )
    warnings.push({
      code: "checkout_evidence_expired",
      message:
        "The checkout observation is missing, stale, conflicting or future-dated. The link must be rechecked before it is offered.",
    });
  if (enrollment.availability === "closed")
    warnings.push({
      code: "enrollment_closed",
      message:
        "Enrollment is currently recorded as closed; no checkout option is offered.",
    });
  warnings.push({
    code: "review_terms_before_payment",
    message:
      "An observed official link is offered only for reviewing the provider's current terms. It does not guarantee enrollment or activate access.",
  });
  return domainResult(
    context,
    {
      mode: canReview
        ? ("observed_official_link" as const)
        : ("blocked" as const),
      url: canReview ? facts.checkoutUrl.value : null,
      checkoutFreshness: destination.freshness,
      titleFreshness: destination.titleFreshness,
      enrollmentAvailability: enrollment.availability,
      priceObservation: facts.price,
      billingObservation: facts.billing,
      commercialFreshness: {
        price: factFreshness(
          context,
          facts.price,
          context.policy.commercialMaxAgeSeconds,
        ),
        billing: factFreshness(
          context,
          facts.billing,
          context.policy.commercialMaxAgeSeconds,
        ),
      },
      sessionCreated: false,
      paymentConfirmed: false,
    },
    fields,
    warnings,
    canReview ? "needs_confirmation" : "blocked",
  );
}

export function prepareCheckout(
  catalog: Catalog,
  input: unknown,
  options: DomainOptions = {},
) {
  const request = checkoutRequestSchema.parse(input);
  const context = domainContext(catalog, request.productId, options);
  const facts = context.product.facts;
  const destination = destinationState(context);
  const enrollment = enrollmentState(context);
  const blockers: Warning[] = [];
  if (!destination.usable)
    blockers.push({
      code: "unverified_checkout",
      message: "The checkout destination is mismatched, unknown or expired.",
    });
  if (enrollment.availability !== "open")
    blockers.push({
      code: "enrollment_not_open",
      field: "enrollment",
      message: "Current enrollment availability is not confirmed open.",
    });
  for (const field of fields.filter((field) => field !== "enrollment")) {
    if (!businessApproved(context, field))
      blockers.push({
        code: "unapproved_terms",
        field,
        message: `The ${field} field is not business-approved.`,
      });
  }
  if (facts.commercialConsistency.value !== "resolved")
    blockers.push({
      code: "conflicting_terms",
      field: "commercialConsistency",
      message: "Commercial discrepancies remain unresolved.",
    });
  for (const field of ["price", "billing", "additionalCharges"] as const) {
    if (
      factFreshness(
        context,
        facts[field],
        context.policy.commercialMaxAgeSeconds,
      ).state !== "fresh"
    )
      blockers.push({
        code: "stale_commercial_terms",
        field,
        message: `The ${field} evidence requires a refresh.`,
      });
  }
  if (
    typeof facts.accessStartRule.value !== "object" ||
    facts.accessStartRule.value === null ||
    typeof facts.accessEndRule.value !== "object" ||
    facts.accessEndRule.value === null
  )
    blockers.push({
      code: "unsupported_access_policy",
      message:
        "A supported structured access policy is required before checkout can be presented as ready.",
    });
  return domainResult(
    context,
    {
      mode: blockers.length
        ? ("blocked" as const)
        : ("approved_hosted_link" as const),
      url: blockers.length ? null : facts.checkoutUrl.value,
      sessionCreated: false,
      paymentConfirmed: false,
      accessGranted: false,
      externalRequestPerformed: false,
    },
    fields,
    blockers,
    blockers.length ? "blocked" : "ok",
  );
}
