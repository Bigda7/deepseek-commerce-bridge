import { describe, expect, it } from "vitest";
import { formatCatalogPrice } from "@/domain/money";
import { getProductRecord } from "@/domain/catalog";
import { executeTool } from "@/tools/registry";
import { buildCommerceView } from "@/presentation/commerce";
import {
  approvedCatalog,
  observedCatalog,
  fixedClock,
  productId,
} from "./fixtures/commerce";

describe("catalog money presentation across API, tools and UI", () => {
  it.each([
    [17900, "USD", "USD 179.00"],
    [1, "EUR", "EUR 0.01"],
    [0, "GBP", "GBP 0.00"],
    [123456, "USD", "USD 1,234.56"],
  ] as const)(
    "renders %i minor units in %s as %s",
    (amountMinor, currency, display) => {
      expect(formatCatalogPrice({ amountMinor, currency })).toBe(display);
    },
  );
  it("keeps a missing amount unknown", () => {
    expect(formatCatalogPrice(null)).toBe("Unknown");
  });
  it("shares the canonical display and preserves raw amount and observation status", () => {
    const catalog = observedCatalog();
    const record = getProductRecord(catalog, productId)!;
    const tool = executeTool("get_product", JSON.stringify({ productId }), {
      catalog,
    });
    expect(record.priceDisplay).toBe("USD 179.00");
    expect(tool.data).toMatchObject({
      priceDisplay: record.priceDisplay,
      product: {
        facts: {
          price: {
            value: { amountMinor: 17900, currency: "USD" },
            status: "observed",
          },
        },
      },
    });
    expect(
      buildCommerceView(catalog, productId, { clock: fixedClock }).price
        .display,
    ).toBe(record.priceDisplay);
  });
  it("updates the display when attributable fixture configuration changes", () => {
    const catalog = approvedCatalog({
      price: { amountMinor: 18950, currency: "EUR" },
    });
    const result = executeTool("get_product", JSON.stringify({ productId }), {
      catalog,
    });
    expect(result.data).toMatchObject({
      priceDisplay: "EUR 189.50",
      product: { facts: { price: { status: "confirmed" } } },
    });
    expect(
      buildCommerceView(catalog, productId, { clock: fixedClock }).price
        .display,
    ).toBe("EUR 189.50");
  });
});
