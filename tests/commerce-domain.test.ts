import { describe, expect, it } from "vitest";
import { getEnrollmentStatus } from "@/domain/enrollment";
import { getNextSessions } from "@/domain/schedule";
import { getAccessPeriod } from "@/domain/access";
import { getEnrollmentOption, prepareCheckout } from "@/domain/checkout";
import { resolveLocalInstant } from "@/domain/calendar";
import { defaultDomainPolicy } from "@/domain/context";
import {
  accessValues,
  approvedCatalog,
  checkoutValues,
  fixedClock,
  observedCatalog,
  productId,
  scheduleValues,
} from "./fixtures/commerce";

const options = { clock: fixedClock };

describe("independent enrollment and freshness", () => {
  it("does not infer open enrollment from ongoing status or a checkout observation", () => {
    const result = getEnrollmentStatus(observedCatalog(), productId, options);
    expect(result.data.availability).toBe("unknown");
    expect(result.data.ongoing).toBe(true);
    expect(result.data.lastVerifiedAt).toBeNull();
    expect(result.data.liveLookupPerformed).toBe(false);
    expect(result.checkedAt).toBe("2026-10-07T12:00:00.000Z");
  });

  it.each(["open", "closed"] as const)(
    "uses fresh approved %s status",
    (enrollment) => {
      expect(
        getEnrollmentStatus(approvedCatalog({ enrollment }), productId, options)
          .data.availability,
      ).toBe(enrollment);
    },
  );

  it("expires approved availability exactly at the configured freshness boundary", () => {
    const result = getEnrollmentStatus(
      approvedCatalog({ enrollment: "open" }, "2026-10-07T11:45:00.000Z"),
      productId,
      options,
    );
    expect(result.data.availability).toBe("unknown");
    expect(result.data.freshness.state).toBe("stale");
    expect(result.data.recordedValue).toBe("open");
  });

  it("rejects future-dated approvals and explicitly stale evidence", () => {
    const future = getEnrollmentStatus(
      approvedCatalog({ enrollment: "open" }, "2026-10-07T12:01:00Z"),
      productId,
      options,
    );
    expect(future.data.availability).toBe("unknown");
    expect(future.data.freshness.state).toBe("future");
    const stale = approvedCatalog({ enrollment: "open" });
    stale.products[0].facts.enrollment.status = "stale";
    expect(
      getEnrollmentStatus(stale, productId, options).data.availability,
    ).toBe("unknown");
  });

  it("does not promote observed status into approved availability", () => {
    const catalog = approvedCatalog({ enrollment: "open" });
    catalog.products[0].facts.enrollment.status = "observed";
    expect(
      getEnrollmentStatus(catalog, productId, options).data.availability,
    ).toBe("unknown");
  });
});

describe("recurring dates without invented sessions", () => {
  it("identifies November 6 as Friday and November 7 only as a tentative Saturday", () => {
    const result = getNextSessions(
      observedCatalog(),
      productId,
      {
        referenceDate: "2026-11-06",
        userTimeZone: "Europe/Budapest",
        limit: 3,
      },
      options,
    );
    expect(result.data.referenceWeekday).toBe("friday");
    expect(
      result.data.candidates.map((candidate) => candidate.programDate),
    ).toEqual(["2026-11-07", "2026-11-14", "2026-11-21"]);
    expect(
      result.data.candidates.every(
        (candidate) =>
          candidate.status === "tentative" &&
          candidate.startsAt === null &&
          candidate.userLocalStart === null,
      ),
    ).toBe(true);
    expect(result.data.confirmedSessionCount).toBe(0);
    expect(result.data.enrollmentAvailabilityInferred).toBe(false);
    expect(result.data.includedClasses).toBe(48);
  });

  it.each(["November 6", "11-06", "2026-02-30"])(
    "rejects ambiguous or invalid date %s",
    (referenceDate) => {
      expect(() =>
        getNextSessions(
          observedCatalog(),
          productId,
          { referenceDate, limit: 3 },
          options,
        ),
      ).toThrow();
    },
  );

  it("rejects invalid zones and unbounded limits", () => {
    expect(() =>
      getNextSessions(
        observedCatalog(),
        productId,
        { referenceDate: "2026-11-06", userTimeZone: "EDT", limit: 3 },
        options,
      ),
    ).toThrow();
    expect(() =>
      getNextSessions(
        observedCatalog(),
        productId,
        { referenceDate: "2026-11-06", limit: 100 },
        options,
      ),
    ).toThrow();
  });

  it("skips approved breaks without claiming the remaining dates are confirmed", () => {
    const catalog = approvedCatalog({ exceptions: ["2026-11-07"] });
    const result = getNextSessions(
      catalog,
      productId,
      { referenceDate: "2026-11-06", limit: 1 },
      options,
    );
    expect(result.data.candidates[0]).toMatchObject({
      programDate: "2026-11-14",
      status: "tentative",
    });
  });

  it("does not treat unapproved exceptions as confirmed cancellations", () => {
    const catalog = approvedCatalog({ exceptions: ["2026-11-07"] });
    catalog.products[0].facts.exceptions.status = "observed";
    expect(
      getNextSessions(
        catalog,
        productId,
        { referenceDate: "2026-11-06", limit: 1 },
        options,
      ).data.candidates[0].programDate,
    ).toBe("2026-11-07");
  });

  it("converts autumn sessions across the differing Europe and US DST boundaries", () => {
    const result = getNextSessions(
      approvedCatalog(scheduleValues),
      productId,
      {
        referenceDate: "2026-10-24",
        userTimeZone: "Europe/Budapest",
        limit: 3,
      },
      options,
    );
    expect(
      result.data.candidates.map((candidate) => candidate.startsAt),
    ).toEqual([
      "2026-10-24T18:00:00.000Z",
      "2026-10-31T18:00:00.000Z",
      "2026-11-07T19:00:00.000Z",
    ]);
    expect(
      result.data.candidates.map((candidate) => candidate.userLocalStart?.time),
    ).toEqual(["20:00", "19:00", "20:00"]);
  });

  it("converts spring dates across the differing US and Europe DST boundaries", () => {
    const catalog = approvedCatalog(scheduleValues, "2026-02-01T10:00:00Z");
    const result = getNextSessions(
      catalog,
      productId,
      {
        referenceDate: "2026-03-07",
        userTimeZone: "Europe/Budapest",
        limit: 5,
      },
      { clock: () => new Date("2026-03-01T00:00:00Z") },
    );
    expect(
      result.data.candidates.map((candidate) => candidate.userLocalStart?.time),
    ).toEqual(["20:00", "19:00", "19:00", "19:00", "20:00"]);
  });

  it("does not convert times without a supported approved DST policy", () => {
    const catalog = approvedCatalog({
      ...scheduleValues,
      dstPolicy: "Unclear marketing text",
    });
    expect(
      getNextSessions(
        catalog,
        productId,
        { referenceDate: "2026-11-06", limit: 1 },
        options,
      ).data.candidates[0].startsAt,
    ).toBeNull();
  });

  it("preserves the user's local date when the converted session crosses midnight", () => {
    const catalog = approvedCatalog(scheduleValues);
    const result = getNextSessions(
      catalog,
      productId,
      { referenceDate: "2026-11-07", userTimeZone: "Asia/Tokyo", limit: 1 },
      options,
    );
    expect(result.data.candidates[0].userLocalStart).toEqual({
      date: "2026-11-08",
      time: "04:00",
      timeZone: "Asia/Tokyo",
    });
  });

  it("does not choose arbitrary instants in repeated or nonexistent local times", () => {
    expect(
      resolveLocalInstant("2026-11-01", "01:30", "America/New_York"),
    ).toEqual({ status: "ambiguous", instant: null });
    expect(
      resolveLocalInstant("2026-03-08", "02:30", "America/New_York"),
    ).toEqual({ status: "nonexistent", instant: null });
  });

  it("skips an already elapsed session on the reference day", () => {
    const catalog = approvedCatalog(scheduleValues);
    const result = getNextSessions(
      catalog,
      productId,
      { referenceDate: "2026-11-07", limit: 1 },
      { clock: () => new Date("2026-11-07T20:00:00Z") },
    );
    expect(result.data.candidates[0].programDate).toBe("2026-11-14");
  });

  it("does not return past calendar candidates", () => {
    const result = getNextSessions(
      observedCatalog(),
      productId,
      { referenceDate: "2026-01-01", limit: 1 },
      options,
    );
    expect(result.data.candidates[0].programDate).toBe("2026-10-10");
    expect(
      result.warnings.some((warning) => warning.code === "past_reference_date"),
    ).toBe(true);
  });
});

describe("one-year access policy previews", () => {
  it("keeps dates unknown even when a caller supplies a payment claim", () => {
    const result = getAccessPeriod(
      observedCatalog(),
      productId,
      { activationDate: "2026-11-06", activationEvent: "payment_confirmed" },
      options,
    );
    expect(result.data).toMatchObject({
      state: "unknown_policy",
      startDate: null,
      endDateExclusive: null,
      entitlementVerified: false,
    });
  });

  it("requires a matching activation reference and supported approved rules", () => {
    const catalog = approvedCatalog(accessValues);
    expect(getAccessPeriod(catalog, productId, {}, options).data.state).toBe(
      "needs_activation",
    );
    expect(
      getAccessPeriod(
        catalog,
        productId,
        {
          activationDate: "2026-11-06",
          activationEvent: "enrollment_confirmed",
        },
        options,
      ).data.state,
    ).toBe("activation_mismatch");
    const prose = approvedCatalog({
      accessStartRule: "Starts sometime after purchase",
      accessEndRule: "One year later",
    });
    expect(
      getAccessPeriod(
        prose,
        productId,
        { activationDate: "2026-11-06", activationEvent: "payment_confirmed" },
        options,
      ).data.state,
    ).toBe("unknown_policy");
  });

  it("calculates a calendar year rather than a fixed 365 days", () => {
    const result = getAccessPeriod(
      approvedCatalog(accessValues),
      productId,
      { activationDate: "2023-03-01", activationEvent: "payment_confirmed" },
      options,
    );
    expect(result.data).toMatchObject({
      state: "policy_preview",
      startDate: "2023-03-01",
      endDateExclusive: "2024-03-01",
      entitlementVerified: false,
      activationReferenceVerified: false,
    });
  });

  it.each([
    ["clamp_to_february_28", "2025-02-28"],
    ["march_1", "2025-03-01"],
  ] as const)(
    "applies explicit leap-day rule %s",
    (leapDayRule, expectedDate) => {
      const catalog = approvedCatalog({
        ...accessValues,
        accessEndRule: {
          unit: "calendar_year",
          years: 1,
          boundary: "exclusive",
          leapDayRule,
        },
      });
      expect(
        getAccessPeriod(
          catalog,
          productId,
          {
            activationDate: "2024-02-29",
            activationEvent: "payment_confirmed",
          },
          options,
        ).data.endDateExclusive,
      ).toBe(expectedDate);
    },
  );
});

describe("official link review and checkout readiness", () => {
  it("offers the observed official link with uncertainty without calling it a verified purchase", () => {
    const result = getEnrollmentOption(observedCatalog(), productId, options);
    expect(result.status).toBe("needs_confirmation");
    expect(result.data).toMatchObject({
      mode: "observed_official_link",
      url: "https://buy.stripe.com/fZudR90Q3cxm69k8sTdMM2n",
      enrollmentAvailability: "unknown",
      sessionCreated: false,
      paymentConfirmed: false,
    });
    expect(result.data.priceObservation.status).toBe("observed");
  });

  it.each([
    "https://buy.stripe.com/another-product",
    "https://buy.stripe.com.evil.example/fZudR90Q3cxm69k8sTdMM2n",
    "https://buy.stripe.com/fZudR90Q3cxm69k8sTdMM2n?redirect=evil",
  ])("blocks a destination mismatch: %s", (url) => {
    const catalog = observedCatalog();
    catalog.products[0].facts.checkoutUrl.value = url;
    expect(
      getEnrollmentOption(catalog, productId, options).data.url,
    ).toBeNull();
  });

  it("blocks title mismatch, closed enrollment and stale checkout observations", () => {
    const mismatch = observedCatalog();
    mismatch.products[0].facts.checkoutTitle.value = "Private lesson";
    expect(
      getEnrollmentOption(mismatch, productId, options).data.url,
    ).toBeNull();
    expect(
      getEnrollmentOption(
        approvedCatalog({ enrollment: "closed" }),
        productId,
        options,
      ).data.url,
    ).toBeNull();
    const stale = getEnrollmentOption(observedCatalog(), productId, {
      clock: () => new Date("2026-10-08T00:00:00Z"),
    });
    expect(stale.data.url).toBeNull();
    expect(stale.data.checkoutFreshness.state).toBe("stale");
  });

  it("blocks checkout readiness when terms and availability are unconfirmed", () => {
    const result = prepareCheckout(
      observedCatalog(),
      { productId, intent: "enroll" },
      options,
    );
    expect(result.status).toBe("blocked");
    expect(result.data).toMatchObject({
      url: null,
      sessionCreated: false,
      paymentConfirmed: false,
      accessGranted: false,
      externalRequestPerformed: false,
    });
    expect(
      result.warnings.some((warning) => warning.code === "conflicting_terms"),
    ).toBe(true);
  });

  it("returns only an approved hosted link when all supported prerequisites are satisfied", () => {
    const result = prepareCheckout(
      approvedCatalog(checkoutValues),
      { productId, intent: "enroll" },
      options,
    );
    expect(result.status).toBe("ok");
    expect(result.data.mode).toBe("approved_hosted_link");
    expect(result.data.url).toBe(checkoutValues.checkoutUrl);
    expect(result.data.paymentConfirmed).toBe(false);
    expect(
      result.sources.some(
        (source) =>
          source.approval?.approvedBy === "Automated test fixture only",
      ),
    ).toBe(true);
  });

  it("expires enrollment independently of commercial terms", () => {
    const catalog = approvedCatalog(checkoutValues, "2026-10-07T11:44:00Z");
    const result = prepareCheckout(
      catalog,
      { productId, intent: "enroll" },
      options,
    );
    expect(result.status).toBe("blocked");
    expect(
      result.warnings.some((warning) => warning.code === "enrollment_not_open"),
    ).toBe(true);
  });

  it("rejects missing intent, injected payment flags and arbitrary URLs", () => {
    const catalog = observedCatalog();
    expect(() => prepareCheckout(catalog, { productId }, options)).toThrow();
    expect(() =>
      prepareCheckout(
        catalog,
        { productId, intent: "enroll", paid: true },
        options,
      ),
    ).toThrow();
    expect(() =>
      prepareCheckout(
        catalog,
        { productId, intent: "enroll", url: "https://evil.example" },
        options,
      ),
    ).toThrow();
  });

  it("is side-effect free on repeated requests and respects an empty destination policy", () => {
    const catalog = approvedCatalog(checkoutValues);
    const first = prepareCheckout(
      catalog,
      { productId, intent: "enroll" },
      options,
    );
    expect(
      prepareCheckout(catalog, { productId, intent: "enroll" }, options),
    ).toEqual(first);
    expect(first.data.sessionCreated).toBe(false);
    expect(
      prepareCheckout(
        catalog,
        { productId, intent: "enroll" },
        {
          ...options,
          policy: { ...defaultDomainPolicy, checkoutDestinations: [] },
        },
      ).data.url,
    ).toBeNull();
  });
});
