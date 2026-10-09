import { describe, expect, it } from "vitest";
import observations from "../data/observations/victory-skating.json";
import noOverrides from "../data/overrides/business-approved.json";
import { catalogSchema } from "@/schemas/catalog";
import { normalizeCatalog } from "@/ingestion/normalize-catalog";
import { getProductRecord, searchProducts } from "@/domain/catalog";
import { loadCatalog } from "@/storage/catalog";

const productId = "vsa-annual-online-ballet";
const approvedPrice = {
  schemaVersion: 1,
  version: "test-fixture",
  changes: [
    {
      id: "test-price",
      productId,
      approval: {
        approvedBy: "Test fixture only",
        approvedAt: "2026-10-07T10:00:00Z",
        reason: "Automated normalization test, not real business approval.",
      },
      facts: {
        price: {
          value: { amountMinor: 18900, currency: "USD" },
          notes: "Test fixture price.",
        },
      },
    },
  ],
};

describe("catalog validation and evidence", () => {
  it("loads the real catalog with observed checkout terms and no invented availability", async () => {
    const catalog = await loadCatalog();
    const facts = catalog.products[0].facts;
    expect(facts.price.value).toEqual({ amountMinor: 17900, currency: "USD" });
    expect(facts.price.status).toBe("observed");
    expect(facts.billing.value).toBe("annual_recurring");
    expect(facts.enrollment).toMatchObject({ value: null, status: "unknown" });
    expect(facts.timeZone.value).toBeNull();
    expect(facts.accessStartRule.value).toBeNull();
    expect(facts.accessEndRule.value).toBeNull();
  });

  it("keeps marketing observations separate from the payable price", () => {
    const catalog = normalizeCatalog(observations, noOverrides);
    expect(
      catalog.observations.some((item) => item.kind === "crossed_out_price"),
    ).toBe(true);
    expect(
      catalog.observations.some((item) => item.kind === "per_class_marketing"),
    ).toBe(true);
    expect(catalog.products[0].facts.price.value?.amountMinor).not.toBe(49900);
    expect(catalog.products[0].facts.price.value?.amountMinor).not.toBe(
      3 * 48 * 100,
    );
  });

  it("rejects a guessed value marked as unknown", () => {
    const product = observations.products[0];
    const invalid = {
      ...observations,
      products: [
        {
          ...product,
          facts: {
            ...product.facts,
            timeZone: { ...product.facts.timeZone, value: "America/New_York" },
          },
        },
      ],
    };
    expect(catalogSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects confirmed prices based solely on checkout observations", () => {
    const invalid = structuredClone(observations);
    invalid.products[0].facts.price.status = "confirmed";
    expect(catalogSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects missing evidence references", () => {
    const invalid = structuredClone(observations);
    invalid.products[0].facts.price.sourceIds = ["missing-source"];
    expect(catalogSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate IDs and unrelated product formats", () => {
    const invalid = structuredClone(observations);
    invalid.products.push(structuredClone(invalid.products[0]));
    expect(catalogSchema.safeParse(invalid).success).toBe(false);
    const privateOffer = {
      ...observations.products[0],
      kind: "private-lesson",
    };
    expect(
      catalogSchema.safeParse({ ...observations, products: [privateOffer] })
        .success,
    ).toBe(false);
  });

  it("rejects fractional minor units and inconsistent observations", () => {
    const invalid = structuredClone(observations);
    invalid.products[0].facts.price.value.amountMinor = 179.5;
    expect(catalogSchema.safeParse(invalid).success).toBe(false);
    const invalidSource = structuredClone(observations);
    invalidSource.sources[2].observedOn = "2026-10-07";
    expect(catalogSchema.safeParse(invalidSource).success).toBe(false);
  });
});

describe("attributable overrides", () => {
  it("uses approved values while retaining the source observations", () => {
    const original = structuredClone(observations);
    const catalog = normalizeCatalog(original, approvedPrice);
    expect(catalog.products[0].facts.price).toMatchObject({
      value: { amountMinor: 18900 },
      status: "confirmed",
      sourceIds: ["approval-test-price"],
    });
    expect(
      catalog.sources.find((source) => source.id === "approval-test-price")
        ?.approval?.approvedBy,
    ).toBe("Test fixture only");
    expect(original.products[0].facts.price.value.amountMinor).toBe(17900);
    expect(catalog.observations).toEqual(observations.observations);
  });

  it("keeps approved values when observations are refreshed", () => {
    const refreshed = structuredClone(observations);
    refreshed.products[0].facts.price.value.amountMinor = 19900;
    expect(
      normalizeCatalog(refreshed, approvedPrice).products[0].facts.price.value
        ?.amountMinor,
    ).toBe(18900);
  });

  it("changes the catalog version when contents change without a manual version bump", () => {
    const changed = structuredClone(observations);
    changed.products[0].facts.coach.value = "Updated observation";
    expect(normalizeCatalog(changed, noOverrides).version).not.toBe(
      normalizeCatalog(observations, noOverrides).version,
    );
  });

  it("rejects missing approval attribution and invalid field values", () => {
    const missingApproval = structuredClone(approvedPrice);
    missingApproval.changes[0].approval.approvedBy = "";
    expect(() => normalizeCatalog(observations, missingApproval)).toThrow();
    const invalidMoney = structuredClone(approvedPrice);
    invalidMoney.changes[0].facts.price.value.amountMinor = 179.5;
    expect(() => normalizeCatalog(observations, invalidMoney)).toThrow();
  });

  it("rejects unknown products, unsupported fields and duplicate changes", () => {
    const unknownProduct = structuredClone(approvedPrice);
    unknownProduct.changes[0].productId = "private-lessons";
    expect(() => normalizeCatalog(observations, unknownProduct)).toThrow();
    const unsupported = {
      ...approvedPrice,
      changes: [
        {
          ...approvedPrice.changes[0],
          facts: {
            accessStartsImmediately: {
              value: true,
              notes: "Unsupported field",
            },
          },
        },
      ],
    };
    expect(() => normalizeCatalog(observations, unsupported)).toThrow();
    const duplicate = structuredClone(approvedPrice);
    duplicate.changes.push({ ...duplicate.changes[0], id: "another-price" });
    expect(() => normalizeCatalog(observations, duplicate)).toThrow();
  });
});

describe("product retrieval and contextual search", () => {
  const catalog = normalizeCatalog(observations, noOverrides);

  it.each([
    "Does Victory Skating offer a year-long online ballet program?",
    "Does VSA have online ballet classes for complete beginners?",
    "I'm an experienced dancer. Does VSA offer an online ballet program?",
    "I want an annual online ballet program I can join from home.",
  ])("finds the annual product: %s", (query) => {
    expect(
      searchProducts(catalog, query).map((product) => product.productId),
    ).toEqual([productId]);
  });

  it.each([
    "VSA",
    "VSA Virginia School of the Arts",
    "private ballet lessons",
    "VSA monthly ballet lessons",
    "online guitar lessons",
  ])(
    "does not silently substitute another offer or unrelated acronym: %s",
    (query) => {
      expect(searchProducts(catalog, query)).toEqual([]);
    },
  );

  it("honors explicit business context", () => {
    expect(searchProducts(catalog, "VSA", "victory-skating")).toHaveLength(1);
    expect(
      searchProducts(catalog, "VSA online ballet", "another-business"),
    ).toEqual([]);
  });

  it("returns field provenance and uncertainty with the product", () => {
    const record = getProductRecord(catalog, productId);
    expect(record?.sources.map((source) => source.id)).toContain(
      "checkout-browser",
    );
    expect(
      record?.warnings.some(
        (warning) =>
          warning.field === "enrollment" && warning.status === "unknown",
      ),
    ).toBe(true);
    expect(record?.dataMode).toBe("manual_source_observations");
    expect(getProductRecord(catalog, "missing-product")).toBeNull();
  });
});
