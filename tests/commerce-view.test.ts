import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { buildCommerceView } from "@/presentation/commerce";
import { CommerceEvidence } from "@/components/commerce-evidence";
import { MessageBubble } from "@/components/commerce-demo";
import { GET as viewRoute } from "@/app/api/products/[productId]/view/route";
import { GET as reviewRoute } from "@/app/api/products/[productId]/review-checkout/route";
import {
  observedCatalog,
  approvedCatalog,
  fixedClock,
  checkoutValues,
  productId,
} from "./fixtures/commerce";
import { loadCatalog } from "@/storage/catalog";
vi.mock("@/storage/catalog", () => ({ loadCatalog: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const route = { params: Promise.resolve({ productId }) };
const options = { clock: fixedClock };
describe("independent commerce presentation", () => {
  it("preserves separate unknown enrollment, access and observed checkout states", () => {
    const view = buildCommerceView(observedCatalog(), productId, options);
    expect(view).toMatchObject({
      enrollment: { availability: "unknown" },
      access: {
        state: "unknown_policy",
        startDate: null,
        entitlementVerified: false,
      },
      checkout: { mode: "observed_official_link" },
      price: { status: "observed", display: "USD 179.00" },
    });
    expect(view.warnings.length).toBeGreaterThan(0);
    expect(
      new Set(
        view.warnings.map(
          (warning) => `${warning.code}:${warning.field}:${warning.message}`,
        ),
      ).size,
    ).toBe(view.warnings.length);
  });
  it("reflects approved configuration changes without hardcoded amounts or terms", () => {
    const view = buildCommerceView(
      approvedCatalog({
        ...checkoutValues,
        price: { amountMinor: 18900, currency: "USD" },
      }),
      productId,
      options,
    );
    expect(view.price).toMatchObject({
      display: "USD 189.00",
      status: "confirmed",
    });
    expect(view.enrollment.availability).toBe("open");
    expect(view.access.startDate).toBeNull();
  });
  it("renders source prose as escaped text and includes independent warnings", () => {
    const view = buildCommerceView(observedCatalog(), productId, options);
    view.description = "<script>alert('source')</script>";
    const html = renderToStaticMarkup(
      createElement(CommerceEvidence, {
        view,
        onRefresh: () => {},
        refreshing: false,
        onCheckout: () => {},
        checking: false,
        checkout: null,
        actionError: null,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Unconfirmed details");
    expect(html).toContain(`/api/products/${productId}/review-checkout`);
  });
  it("renders model HTML and markdown URLs as plain text rather than executable markup", () => {
    const html = renderToStaticMarkup(
      createElement(MessageBubble, {
        message: {
          role: "assistant",
          content:
            "<img src=x onerror=alert(1)> [pay](javascript:alert(1)) https://evil.example",
        },
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;img");
  });
  it("refreshes the typed view through a read-only route", async () => {
    vi.mocked(loadCatalog).mockResolvedValue(observedCatalog());
    const response = await viewRoute(
      new Request(`http://localhost/api/products/${productId}/view`),
      route,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      productId,
      enrollment: { availability: "unknown" },
    });
  });
  it("labels a local clarification without attributing it to a model", () => {
    const html = renderToStaticMarkup(
      createElement(MessageBubble, {
        message: {
          role: "assistant",
          content: "Which year?",
          responseOrigin: "application_clarification",
        },
      }),
    );
    expect(html).toContain("Date clarification");
    expect(html).not.toContain("DeepSeek");
  });
  it("rechecks destination and freshness before redirecting to provider review", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedClock());
    vi.mocked(loadCatalog).mockResolvedValue(observedCatalog());
    const response = await reviewRoute(
      new Request(`http://localhost/api/products/${productId}/review-checkout`),
      route,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(checkoutValues.checkoutUrl);
    vi.setSystemTime("2026-10-09T12:00:00Z");
    const expired = await reviewRoute(
      new Request(`http://localhost/api/products/${productId}/review-checkout`),
      route,
    );
    expect(expired.status).toBe(409);
    expect(expired.headers.get("Location")).toBeNull();
  });
  it("rejects destination injection through redirect query parameters", async () => {
    const response = await reviewRoute(
      new Request(
        `http://localhost/api/products/${productId}/review-checkout?url=https://evil.example`,
      ),
      route,
    );
    expect(response.status).toBe(400);
  });
});
