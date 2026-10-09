import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as enrollment } from "@/app/api/products/[productId]/enrollment/route";
import { GET as sessions } from "@/app/api/products/[productId]/sessions/route";
import { GET as access } from "@/app/api/products/[productId]/access/route";
import { GET as enrollmentOption } from "@/app/api/products/[productId]/enrollment-option/route";
import { POST as checkout } from "@/app/api/checkout/route";
import * as storage from "@/storage/catalog";
import {
  approvedCatalog,
  checkoutValues,
  fixedNow,
  productId,
} from "./fixtures/commerce";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fixedNow));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const route = (id = productId) => ({
  params: Promise.resolve({ productId: id }),
});
const url = (endpoint: string, query = "") =>
  `http://localhost/api/products/${productId}/${endpoint}${query}`;
const checkoutRequest = (value: unknown) =>
  new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });

describe("commerce read APIs", () => {
  it("returns unknown enrollment with explicit checkedAt and no caching", async () => {
    const response = await enrollment(new Request(url("enrollment")), route());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.availability).toBe("unknown");
    expect(body.checkedAt).toBe(fixedNow);
    expect(body.catalogVersion).toBeTruthy();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns upcoming nominal Saturdays without exact appointment times", async () => {
    const response = await sessions(
      new Request(
        url(
          "sessions",
          "?referenceDate=2026-11-06&userTimeZone=Europe%2FBudapest&limit=1",
        ),
      ),
      route(),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.referenceWeekday).toBe("friday");
    expect(body.data.candidates[0]).toMatchObject({
      programDate: "2026-11-07",
      startsAt: null,
      status: "tentative",
    });
  });

  it.each([
    "",
    "?referenceDate=November%206",
    "?referenceDate=2026-11-06&referenceDate=2026-12-01",
    "?referenceDate=2026-11-06&limit=100",
    "?referenceDate=2026-11-06&userTimeZone=EDT",
    "?referenceDate=2026-11-06&paid=true",
  ])("rejects unsafe or ambiguous schedule input: %s", async (query) => {
    const response = await sessions(
      new Request(url("sessions", query)),
      route(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid_input");
  });

  it("accepts UTC as an explicit user time zone", async () => {
    expect(
      (
        await sessions(
          new Request(
            url("sessions", "?referenceDate=2026-11-06&userTimeZone=UTC"),
          ),
          route(),
        )
      ).status,
    ).toBe(200);
  });

  it("does not infer an access entitlement from a caller's payment claim", async () => {
    const response = await access(
      new Request(
        url(
          "access",
          "?activationDate=2026-11-06&activationEvent=payment_confirmed",
        ),
      ),
      route(),
    );
    const body = await response.json();
    expect(body.data).toMatchObject({
      state: "unknown_policy",
      startDate: null,
      endDateExclusive: null,
      entitlementVerified: false,
    });
  });

  it("rejects user-controlled checkout URLs in read endpoints", async () => {
    const response = await enrollmentOption(
      new Request(url("enrollment-option", "?url=https://evil.example")),
      route(),
    );
    expect(response.status).toBe(400);
  });

  it.each([enrollment, enrollmentOption])(
    "returns 404 for an unknown product without inventing facts",
    async (handler) => {
      const response = await handler(
        new Request(url("enrollment")),
        route("missing-product"),
      );
      expect(response.status).toBe(404);
      expect((await response.json()).status).toBe("unknown_product");
    },
  );

  it("returns an observed official review link with unresolved terms disclosed", async () => {
    const response = await enrollmentOption(
      new Request(url("enrollment-option")),
      route(),
    );
    const body = await response.json();
    expect(body.status).toBe("needs_confirmation");
    expect(body.data.mode).toBe("observed_official_link");
    expect(
      body.warnings.some(
        (warning: { code: string }) =>
          warning.code === "review_terms_before_payment",
      ),
    ).toBe(true);
  });

  it("fails closed without leaking internal configuration errors", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(storage, "loadCatalog").mockRejectedValue(
      new Error("Sensitive configuration content"),
    );
    const response = await enrollment(new Request(url("enrollment")), route());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Sensitive configuration");
    expect(logs).toHaveBeenCalledWith(
      "Commerce request failed while loading or evaluating catalog data.",
    );
  });
});

describe("checkout readiness API", () => {
  it("returns 409 while keeping payment and access unconfirmed", async () => {
    const response = await checkout(
      checkoutRequest({ productId, intent: "enroll" }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).data).toMatchObject({
      mode: "blocked",
      url: null,
      sessionCreated: false,
      paymentConfirmed: false,
      accessGranted: false,
      externalRequestPerformed: false,
    });
  });

  it.each([
    {},
    { productId },
    { productId, intent: "pay" },
    { productId, intent: "enroll", url: "https://evil.example" },
    { productId, intent: "enroll", paid: true },
  ])("rejects invalid intent or injected action fields: %j", async (value) => {
    const response = await checkout(checkoutRequest(value));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown product", async () => {
    expect(
      (
        await checkout(
          checkoutRequest({ productId: "unknown-product", intent: "enroll" }),
        )
      ).status,
    ).toBe(404);
  });

  it("rejects malformed JSON, missing content type and oversized bodies", async () => {
    const malformed = new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await checkout(malformed)).status).toBe(400);
    const wrongType = new Request("http://localhost/api/checkout", {
      method: "POST",
      body: "{}",
    });
    expect((await checkout(wrongType)).status).toBe(415);
    expect(
      (
        await checkout(
          checkoutRequest({
            productId,
            intent: "enroll",
            padding: "x".repeat(8193),
          }),
        )
      ).status,
    ).toBe(413);
  });

  it("returns an approved link for an explicitly labeled fixture without creating a session", async () => {
    vi.spyOn(storage, "loadCatalog").mockResolvedValue(
      approvedCatalog(checkoutValues),
    );
    const response = await checkout(
      checkoutRequest({ productId, intent: "enroll" }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      mode: "approved_hosted_link",
      sessionCreated: false,
      paymentConfirmed: false,
    });
  });
});
