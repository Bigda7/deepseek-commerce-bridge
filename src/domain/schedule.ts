import type { Catalog, FactKey } from "@/schemas/catalog";
import { sessionQuerySchema, type SessionQuery } from "@/schemas/commerce";
import {
  businessApproved,
  domainContext,
  domainResult,
  factWarnings,
  type DomainOptions,
  type Warning,
} from "@/domain/context";
import {
  addCalendarDays,
  localDateTime,
  resolveLocalInstant,
  weekdayOf,
} from "@/domain/calendar";

const fields: FactKey[] = [
  "weekday",
  "localStartTime",
  "timeZone",
  "dstPolicy",
  "exceptions",
  "includedClasses",
];
type Candidate = {
  programDate: string;
  status: "tentative";
  startsAt: string | null;
  programTimeZone: string | null;
  userLocalStart: ReturnType<typeof localDateTime> | null;
  timeResolution: "unknown" | "resolved" | "ambiguous" | "nonexistent";
};

export function getNextSessions(
  catalog: Catalog,
  productId: string,
  input: SessionQuery,
  options: DomainOptions = {},
) {
  const query = sessionQuerySchema.parse(input);
  const context = domainContext(catalog, productId, options);
  const facts = context.product.facts;
  const warnings: Warning[] = factWarnings(context.product, fields);
  const zoneApproved = businessApproved(context, "timeZone");
  const timeApproved = businessApproved(context, "localStartTime");
  const dstApproved =
    businessApproved(context, "dstPolicy") &&
    facts.dstPolicy.value === "follow_canonical_zone";
  const timeZone = zoneApproved ? facts.timeZone.value : null;
  const canResolve = Boolean(timeZone && timeApproved && dstApproved);
  const today = timeZone
    ? localDateTime(context.now, timeZone).date
    : context.now.toISOString().slice(0, 10);
  const startDate = [query.referenceDate, today].sort().at(-1)!;
  const exclusions = businessApproved(context, "exceptions")
    ? (facts.exceptions.value ?? [])
    : [];
  const candidates: Candidate[] = [];
  if (!canResolve)
    warnings.push({
      code: "canonical_schedule_unconfirmed",
      message:
        "Dates are nominal program-calendar candidates, not user-local appointment dates. No exact time conversion is possible without an approved time, IANA zone and DST policy.",
    });
  if (startDate !== query.referenceDate)
    warnings.push({
      code: "past_reference_date",
      message: `The reference date is in the past; candidates begin on or after ${today}.`,
    });
  warnings.push({
    code: "sessions_not_guaranteed",
    message:
      "A weekly rule does not confirm a session or reconstruct all 48 included classes. Enrollment availability is evaluated separately.",
  });
  const weekdayKnown =
    facts.weekday.status === "confirmed" && facts.weekday.value !== null;
  for (
    let offset = 0;
    weekdayKnown && offset <= 370 && candidates.length < query.limit;
    offset++
  ) {
    const programDate = addCalendarDays(startDate, offset);
    if (
      weekdayOf(programDate) !== facts.weekday.value ||
      exclusions.includes(programDate)
    )
      continue;
    const resolved = canResolve
      ? resolveLocalInstant(programDate, facts.localStartTime.value!, timeZone!)
      : { status: "unknown" as const, instant: null };
    if (resolved.instant && resolved.instant.getTime() <= context.now.getTime())
      continue;
    if (resolved.status === "ambiguous" || resolved.status === "nonexistent")
      warnings.push({
        code: `local_time_${resolved.status}`,
        message: `The configured local time on ${programDate} is ${resolved.status}; no instant was chosen.`,
      });
    candidates.push({
      programDate,
      status: "tentative",
      startsAt: resolved.instant?.toISOString() ?? null,
      programTimeZone: timeZone,
      userLocalStart:
        resolved.instant && query.userTimeZone
          ? localDateTime(resolved.instant, query.userTimeZone)
          : null,
      timeResolution: resolved.status,
    });
  }
  return domainResult(
    context,
    {
      referenceDate: query.referenceDate,
      referenceWeekday: weekdayOf(query.referenceDate),
      todayBasis: timeZone ?? "UTC_fallback_for_calendar_candidates_only",
      dateBasis: canResolve
        ? "approved_program_time_zone"
        : "nominal_program_calendar_only",
      userTimeZone: query.userTimeZone ?? null,
      candidates,
      confirmedSessionCount: 0,
      includedClasses: facts.includedClasses.value,
      excludedDates: exclusions,
      enrollmentAvailabilityInferred: false,
    },
    fields,
    warnings,
    "needs_confirmation",
  );
}
