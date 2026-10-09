import type { CommerceView } from "@/schemas/chat";

type Warning = CommerceView["warnings"][number];
type Topic =
  | "enrollment"
  | "payment"
  | "schedule"
  | "access"
  | "policies"
  | "requirements"
  | "other";
export type WarningGroup = {
  topic: Topic;
  title: string;
  message: string;
  warnings: Warning[];
};

const fields: Record<string, Topic> = {
  enrollment: "enrollment",
  checkoutUrl: "enrollment",
  checkoutTitle: "enrollment",
  price: "payment",
  billing: "payment",
  commercialConsistency: "payment",
  additionalCharges: "payment",
  advertisedTimes: "schedule",
  localStartTime: "schedule",
  timeZone: "schedule",
  dstPolicy: "schedule",
  exceptions: "schedule",
  accessStartRule: "access",
  accessEndRule: "access",
  cancellationPolicy: "policies",
  refundPolicy: "policies",
  requirements: "requirements",
};
const codes: Record<string, Topic> = {
  checkout_destination_mismatch: "enrollment",
  checkout_evidence_expired: "enrollment",
  enrollment_closed: "enrollment",
  enrollment_evidence_unusable: "enrollment",
  ongoing_does_not_mean_open: "enrollment",
  review_terms_before_payment: "enrollment",
  unverified_checkout: "enrollment",
  enrollment_not_open: "enrollment",
  canonical_schedule_unconfirmed: "schedule",
  past_reference_date: "schedule",
  sessions_not_guaranteed: "schedule",
  unknown_policy: "access",
  needs_activation: "access",
  activation_mismatch: "access",
  entitlement_not_verified: "access",
  unsupported_access_policy: "access",
};
const titles: Record<Topic, string> = {
  enrollment: "Enrollment and checkout",
  payment: "Price and payment terms",
  schedule: "Class schedule",
  access: "Your one-year access",
  policies: "Cancellation and refunds",
  requirements: "Participation requirements",
  other: "Other limitations",
};

function summary(topic: Topic, warnings: Warning[]) {
  const has = (code: string) =>
    warnings.some((warning) => warning.code === code);
  switch (topic) {
    case "enrollment":
      if (has("enrollment_closed"))
        return "Enrollment is closed in the current record.";
      if (has("checkout_destination_mismatch"))
        return "The saved checkout destination does not match the expected product. Do not use it to pay.";
      if (has("checkout_evidence_expired"))
        return "The saved checkout details are too old to verify. Check current terms with the business.";
      return "Current enrollment or checkout details need confirmation. A saved payment link does not establish that enrollment is open.";
    case "payment":
      return (
        "Some pricing or payment conditions need confirmation. Check the total, recurring billing and any extra fees before paying." +
        (warnings.some((warning) => warning.field === "commercialConsistency")
          ? " Marketing figures and the checkout total have not been reconciled."
          : "")
      );
    case "schedule":
      return (
        "Exact times, daylight-saving rules or individual sessions need confirmation. Calculated Saturdays are tentative." +
        (has("past_reference_date")
          ? " Your reference date is in the past."
          : "")
      );
    case "access":
      if (has("unknown_policy") || has("unsupported_access_policy"))
        return "The start and end rules for your one-year access need confirmation. Payment intent does not activate access.";
      return "Access dates depend on the activation and expiry rules. A calculation or payment claim does not verify access.";
    case "policies":
      return "Check the current cancellation and refund conditions with the business before paying.";
    case "requirements":
      return "Participation requirements come from the saved program page. Check current requirements with the business.";
    case "other":
      return warnings
        .map(
          (warning) =>
            warning.message.trim() || "Further confirmation is required.",
        )
        .join(" ");
  }
}

export function groupWarnings(warnings: Warning[]): WarningGroup[] {
  const groups = new Map<Topic, Warning[]>();
  const seen = new Set<string>();
  for (const warning of warnings) {
    const key = JSON.stringify([warning.code, warning.field, warning.message]);
    if (seen.has(key)) continue;
    seen.add(key);
    const topic =
      (warning.field && Object.hasOwn(fields, warning.field)
        ? fields[warning.field]
        : undefined) ??
      (Object.hasOwn(codes, warning.code) ? codes[warning.code] : undefined) ??
      (warning.code.startsWith("local_time_") ? "schedule" : "other");
    const bucket = groups.get(topic) ?? [];
    bucket.push(warning);
    groups.set(topic, bucket);
  }
  return Array.from(groups, ([topic, items]) => ({
    topic,
    title: titles[topic],
    message: summary(topic, items),
    warnings: items,
  }));
}
