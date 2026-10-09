import type { Catalog } from "@/schemas/catalog";
import {
  businessApproved,
  domainContext,
  domainResult,
  factFreshness,
  factWarnings,
  type DomainContext,
  type DomainOptions,
} from "@/domain/context";

export function enrollmentState(context: DomainContext) {
  const fact = context.product.facts.enrollment;
  const freshness = factFreshness(
    context,
    fact,
    context.policy.enrollmentMaxAgeSeconds,
  );
  const availability =
    businessApproved(context, "enrollment") && freshness.state === "fresh"
      ? fact.value!
      : "unknown";
  return {
    availability,
    recordedValue: fact.value,
    evidenceStatus: fact.status,
    freshness,
    ongoing: context.product.facts.programModel.value === "ongoing",
    lastVerifiedAt: availability !== "unknown" ? freshness.evidenceAt : null,
    liveLookupPerformed: false,
  };
}

export function getEnrollmentStatus(
  catalog: Catalog,
  productId: string,
  options: DomainOptions = {},
) {
  const context = domainContext(catalog, productId, options);
  const data = enrollmentState(context);
  const warnings = factWarnings(context.product, ["enrollment"]);
  if (data.freshness.state === "stale" || data.freshness.state === "future")
    warnings.push({
      field: "enrollment",
      code: "enrollment_evidence_unusable",
      message:
        "Enrollment evidence is expired or future-dated. Current availability is unknown.",
    });
  if (data.availability === "unknown")
    warnings.push({
      code: "ongoing_does_not_mean_open",
      message:
        "An ongoing program or a previously working checkout does not confirm current enrollment availability.",
    });
  return domainResult(
    context,
    data,
    ["enrollment", "programModel"],
    warnings,
    data.availability === "unknown" ? "needs_confirmation" : "ok",
  );
}
