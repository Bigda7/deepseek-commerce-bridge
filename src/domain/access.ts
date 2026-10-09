import type { Catalog } from "@/schemas/catalog";
import { accessQuerySchema, type AccessQuery } from "@/schemas/commerce";
import {
  businessApproved,
  domainContext,
  domainResult,
  factWarnings,
  type DomainOptions,
} from "@/domain/context";
import { addCalendarYear } from "@/domain/calendar";

export function getAccessPeriod(
  catalog: Catalog,
  productId: string,
  input: AccessQuery = {},
  options: DomainOptions = {},
) {
  const query = accessQuerySchema.parse(input);
  const context = domainContext(catalog, productId, options);
  const facts = context.product.facts;
  const startRule = facts.accessStartRule.value;
  const endRule = facts.accessEndRule.value;
  const warnings = factWarnings(context.product, [
    "accessStartRule",
    "accessEndRule",
  ]);
  const policyKnown =
    businessApproved(context, "accessStartRule") &&
    businessApproved(context, "accessEndRule") &&
    startRule !== null &&
    typeof startRule === "object" &&
    endRule !== null &&
    typeof endRule === "object";
  let startDate: string | null = null;
  let endDateExclusive: string | null = null;
  let state:
    | "unknown_policy"
    | "needs_activation"
    | "activation_mismatch"
    | "policy_preview" = "unknown_policy";
  if (policyKnown) {
    state = "needs_activation";
    if (query.activationDate && query.activationEvent) {
      if (query.activationEvent !== startRule.trigger)
        state = "activation_mismatch";
      else {
        state = "policy_preview";
        startDate = query.activationDate;
        endDateExclusive = addCalendarYear(startDate, endRule.leapDayRule);
      }
    }
  }
  if (state !== "policy_preview")
    warnings.push({
      code: state,
      message:
        "Access dates require a supported approved policy and a matching activation reference. They are not inferred from payment intent or a calendar candidate.",
    });
  warnings.push({
    code: "entitlement_not_verified",
    message:
      "A caller-supplied activation reference is only a policy preview. It is not proof of payment, enrollment, or granted access.",
  });
  return domainResult(
    context,
    {
      state,
      entitlementYears: facts.entitlementYears.value,
      startDate,
      endDateExclusive,
      entitlementVerified: false,
      activationReferenceVerified: false,
    },
    ["entitlementYears", "accessStartRule", "accessEndRule"],
    warnings,
    "needs_confirmation",
  );
}
