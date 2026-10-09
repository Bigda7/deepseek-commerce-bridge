import { describe, expect, it } from "vitest";
import { groupWarnings } from "@/presentation/warnings";
import { observedCatalog, productId, fixedClock } from "./fixtures/commerce";
import { buildCommerceView } from "@/presentation/commerce";
import { prepareCheckout } from "@/domain/checkout";

describe("customer warning summaries", () => {
  it("groups the observed catalog while preserving every original diagnostic", () => {
    const warnings = buildCommerceView(observedCatalog(), productId, {
      clock: fixedClock,
    }).warnings;
    const original = structuredClone(warnings);
    const groups = groupWarnings(warnings);
    expect(groups.length).toBeLessThan(warnings.length);
    expect(new Set(groups.map((group) => group.topic))).toEqual(
      new Set([
        "enrollment",
        "payment",
        "schedule",
        "access",
        "policies",
        "requirements",
      ]),
    );
    expect(groups.flatMap((group) => group.warnings)).toHaveLength(
      warnings.length,
    );
    for (const warning of warnings)
      expect(groups.flatMap((group) => group.warnings)).toContain(warning);
    expect(warnings).toEqual(original);
  });
  it("does not drop blockers when summarizing enrollment readiness", () => {
    const result = prepareCheckout(
      observedCatalog(),
      { productId, intent: "enroll" },
      { clock: fixedClock },
    );
    expect(result.status).toBe("blocked");
    const groups = groupWarnings(result.warnings);
    expect(groups.flatMap((group) => group.warnings)).toHaveLength(
      result.warnings.length,
    );
    expect(groups.some((group) => group.topic === "access")).toBe(true);
    expect(groups.some((group) => group.topic === "payment")).toBe(true);
  });
  it("deduplicates identical diagnostics without merging distinct reasons", () => {
    const first = {
      code: "unapproved_terms",
      field: "price",
      message: "Approval missing.",
    };
    const second = { ...first, message: "Evidence expired." };
    expect(groupWarnings([first, first, second])[0].warnings).toEqual([
      first,
      second,
    ]);
  });
  it("retains unknown and prototype-shaped fields as additional limitations", () => {
    const warnings = [
      {
        code: "constructor",
        field: "toString",
        message: "Unexpected source failure.",
      },
    ];
    const group = groupWarnings(warnings)[0];
    expect(group.topic).toBe("other");
    expect(group.message).toContain(warnings[0].message);
    expect(group.warnings).toEqual(warnings);
  });
  it("never emits an empty title or message for blank diagnostics", () => {
    const groups = groupWarnings([{ code: "", field: "", message: "   " }]);
    expect(groups[0].title.trim()).not.toBe("");
    expect(groups[0].message.trim()).not.toBe("");
    expect(groupWarnings([])).toEqual([]);
  });
  it("distinguishes a closed enrollment from an unknown enrollment", () => {
    const closed = groupWarnings([
      { code: "enrollment_closed", message: "Closed." },
    ])[0];
    const unknown = groupWarnings([
      { code: "enrollment_not_open", message: "Unknown." },
    ])[0];
    expect(closed.message).not.toBe(unknown.message);
    expect(closed.message).toContain("closed");
  });
  it("keeps unsafe and expired payment destinations explicit", () => {
    for (const code of [
      "checkout_destination_mismatch",
      "checkout_evidence_expired",
    ]) {
      const group = groupWarnings([{ code, message: "Blocked." }])[0];
      expect(group.topic).toBe("enrollment");
      expect(group.message).not.toBe(
        groupWarnings([{ code: "enrollment_not_open", message: "Unknown." }])[0]
          .message,
      );
    }
  });
});
