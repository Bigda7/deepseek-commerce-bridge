import { describe, expect, it } from "vitest";
import { DemoSessionBudget } from "@/demo/session-budget";

describe("finite interactive demo budget without network", () => {
  it("reserves before sending and settles reported usage", () => {
    const budget = new DemoSessionBudget(2, 0.1);
    budget.reserve(10000, 1024);
    expect(budget.requests).toBe(1);
    expect(budget.reservedUsd).toBeGreaterThan(0);
    budget.settle(2000, 100);
    expect(budget.estimatedUsd).toBeCloseTo(0.00072);
    expect(budget.reservedUsd).toBe(0);
  });
  it("refuses a request whose conservative reservation exceeds the target", () => {
    const budget = new DemoSessionBudget(5, 0.001);
    expect(() => budget.reserve(10000, 1024)).toThrow("estimate_limit");
    expect(budget.requests).toBe(0);
  });
  it("blocks concurrency and the configured request count", () => {
    const budget = new DemoSessionBudget(1, 0.1);
    budget.reserve(100, 1024);
    expect(() => budget.reserve(100, 1024)).toThrow("provider_request_active");
    budget.settle(10, 10);
    expect(() => budget.reserve(100, 1024)).toThrow("request_limit");
  });
  it("keeps a conservative charge and halts on missing usage or a failed request", () => {
    for (const reason of ["provider_failure", "usage_unreported"]) {
      const budget = new DemoSessionBudget(5, 0.1);
      budget.reserve(10000, 1024);
      const reserved = budget.reservedUsd;
      budget.fail(reason);
      expect(budget.estimatedUsd).toBe(reserved);
      expect(() => budget.reserve(100, 1024)).toThrow(reason);
    }
  });
  it("does not treat invalid or over-limit usage as free", () => {
    const budget = new DemoSessionBudget(5, 0.1);
    budget.reserve(100, 1024);
    budget.settle(Number.NaN, 100);
    expect(budget.stoppedReason).toBe("usage_unreported");
    expect(budget.estimatedUsd).toBeGreaterThan(0);
    const exceeded = new DemoSessionBudget(5, 0.01);
    exceeded.reserve(100, 1024);
    exceeded.settle(100000, 1000);
    expect(() => exceeded.reserve(100, 1024)).toThrow("estimate_limit");
  });
  it("rejects unsupported output limits before counting a request", () => {
    const budget = new DemoSessionBudget(5, 0.1);
    expect(() => budget.reserve(100, 100000)).toThrow(
      "invalid_provider_reservation",
    );
    expect(budget.requests).toBe(0);
  });
});
