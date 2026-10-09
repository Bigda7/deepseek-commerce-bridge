import { describe, expect, it } from "vitest";
import {
  executeTool,
  toolDefinitions,
  type ToolContext,
} from "@/tools/registry";
import {
  approvedCatalog,
  checkoutValues,
  fixedClock,
  observedCatalog,
  productId,
} from "./fixtures/commerce";

function context(): ToolContext {
  return { catalog: observedCatalog(), domainOptions: { clock: fixedClock } };
}
function execute(name: string, input: unknown, toolContext = context()) {
  return executeTool(name, JSON.stringify(input), toolContext);
}

describe("catalog tool registry", () => {
  it("attaches only canonical program navigation after successfully resolving a product", () => {
    const catalog = context().catalog;
    expect(execute("get_enrollment_status", { productId }).navigation).toEqual({
      productId,
      landingUrl: catalog.products[0].landingUrl,
    });
    expect(execute("get_access_period", { productId }).navigation).toEqual({
      productId,
      landingUrl: catalog.products[0].landingUrl,
    });
    expect(
      execute("get_enrollment_status", { productId: "missing" }).navigation,
    ).toBeUndefined();
    expect(
      execute("search_products", { query: "unrelated" }).navigation,
    ).toBeUndefined();
  });
  it("searches using product context and preserves bare acronym ambiguity", () => {
    expect(
      execute("search_products", { query: "VSA online ballet" }).data,
    ).toMatchObject({ matches: [{ productId }] });
    expect(execute("search_products", { query: "VSA" }).data).toMatchObject({
      matches: [],
    });
    expect(
      execute("search_products", { query: "private ballet" }).data,
    ).toMatchObject({ matches: [] });
  });
  it("returns the canonical record and preserves observed and unknown fields", () => {
    const result = execute("get_product", { productId });
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      product: {
        facts: {
          price: { status: "observed" },
          enrollment: { value: null, status: "unknown" },
        },
      },
    });
  });
  it("keeps unknown enrollment separate from tentative sessions and access", () => {
    expect(execute("get_enrollment_status", { productId }).data).toMatchObject({
      data: { availability: "unknown", ongoing: true },
    });
    expect(
      execute("get_next_sessions", { productId, referenceDate: "2026-11-06" })
        .data,
    ).toMatchObject({
      data: {
        referenceWeekday: "friday",
        candidates: [
          { programDate: "2026-11-07", status: "tentative", startsAt: null },
          { programDate: "2026-11-14" },
          { programDate: "2026-11-21" },
        ],
      },
    });
    expect(
      execute("get_access_period", {
        productId,
        activationDate: "2026-10-07",
        activationEvent: "payment_confirmed",
      }).data,
    ).toMatchObject({ data: { startDate: null, entitlementVerified: false } });
  });
  it("offers observed link review with warnings rather than payment confirmation", () => {
    expect(execute("get_enrollment_option", { productId }).data).toMatchObject({
      status: "needs_confirmation",
      data: { mode: "observed_official_link", paymentConfirmed: false },
    });
  });
  it.each([
    ["get_product", { productId, paid: true }],
    ["get_next_sessions", { productId, referenceDate: "November 6" }],
    [
      "get_next_sessions",
      { productId, referenceDate: "2026-11-06", userTimeZone: "EDT" },
    ],
    [
      "get_next_sessions",
      { productId, referenceDate: "2026-11-06", limit: "3" },
    ],
    ["get_access_period", { productId, activationDate: "2026-02-30" }],
    [
      "prepare_checkout",
      { productId, intent: "enroll", url: "https://evil.example" },
    ],
    ["search_products", { query: "x".repeat(501) }],
  ])("rejects invalid arguments for %s", (name, input) => {
    expect(execute(name as string, input).status).toBe("invalid_arguments");
  });
  it("rejects malformed and oversized JSON without returning the supplied content", () => {
    const toolContext = context();
    expect(
      executeTool("get_product", "{ secret: bad", toolContext),
    ).toMatchObject({ status: "invalid_arguments" });
    expect(
      executeTool("get_product", " ".repeat(8193), toolContext).status,
    ).toBe("invalid_arguments");
    expect(execute("get_product", null).status).toBe("invalid_arguments");
  });
  it("never executes an unregistered function or unknown product", () => {
    expect(
      execute("fetch_arbitrary_url", { url: "http://127.0.0.1" }).status,
    ).toBe("unknown_tool");
    expect(execute("get_product", { productId: "not-known" }).status).toBe(
      "unknown_product",
    );
  });
  it("requires server-side product authorization even when all terms are approved", () => {
    const toolContext = {
      ...context(),
      catalog: approvedCatalog(checkoutValues),
    };
    expect(
      execute("prepare_checkout", { productId, intent: "enroll" }, toolContext)
        .status,
    ).toBe("action_not_authorized");
    expect(
      execute(
        "prepare_checkout",
        { productId, intent: "enroll" },
        {
          ...toolContext,
          checkoutAuthorizedProductIds: new Set(["other-product"]),
        },
      ).status,
    ).toBe("action_not_authorized");
    expect(
      execute(
        "prepare_checkout",
        { productId, intent: "enroll" },
        { ...toolContext, checkoutAuthorizedProductIds: new Set([productId]) },
      ).data,
    ).toMatchObject({
      status: "ok",
      data: {
        mode: "approved_hosted_link",
        paymentConfirmed: false,
        sessionCreated: false,
      },
    });
  });
  it("authorization does not bypass domain blockers on real observations", () => {
    const result = execute(
      "prepare_checkout",
      { productId, intent: "enroll" },
      { ...context(), checkoutAuthorizedProductIds: new Set([productId]) },
    );
    expect(result).toMatchObject({
      status: "ok",
      data: { status: "blocked", data: { url: null, accessGranted: false } },
    });
  });
  it("publishes object schemas with extra properties forbidden", () => {
    expect(
      new Set(toolDefinitions.map((tool) => tool.function.name)).size,
    ).toBe(7);
    for (const tool of toolDefinitions)
      expect(tool.function.parameters).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
  });
});
