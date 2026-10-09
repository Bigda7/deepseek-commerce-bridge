import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as listProducts } from "@/app/api/products/route";
import { GET as readProduct } from "@/app/api/products/[productId]/route";
import * as storage from "@/storage/catalog";

afterEach(() => vi.restoreAllMocks());

describe("catalog HTTP contracts", () => {
  it("lists matching products without claiming enrollment availability", async () => {
    const response = await listProducts(
      new Request("http://localhost/api/products?q=VSA%20online%20ballet"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.data.map((product: { productId: string }) => product.productId),
    ).toEqual(["vsa-annual-online-ballet"]);
    expect(body.catalogVersion).toBeTruthy();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    "q=" + "a".repeat(501),
    "q=ballet&q=private",
    "admin=true",
    "businessId=../outside",
  ])("rejects invalid query parameters: %s", async (query) => {
    const response = await listProducts(
      new Request(`http://localhost/api/products?${query}`),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid_input");
  });

  it("retrieves the same observed facts used by the domain service", async () => {
    const response = await readProduct(
      new Request("http://localhost/api/products/vsa-annual-online-ballet"),
      { params: Promise.resolve({ productId: "vsa-annual-online-ballet" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.product.facts.price).toMatchObject({
      status: "observed",
      value: { amountMinor: 17900, currency: "USD" },
    });
    expect(body.data.product.facts.enrollment.value).toBeNull();
  });

  it.each([
    ["missing-product", 404, "unknown_product"],
    ["../outside", 400, "invalid_input"],
  ] as const)(
    "returns a stable error for %s",
    async (productId, status, code) => {
      const response = await readProduct(
        new Request("http://localhost/api/products/test"),
        { params: Promise.resolve({ productId }) },
      );
      expect(response.status).toBe(status);
      expect((await response.json()).status).toBe(code);
    },
  );

  it("does not expose internal errors or substitute fabricated data when loading fails", async () => {
    vi.spyOn(storage, "loadCatalog").mockRejectedValue(
      new Error("Private internal configuration details"),
    );
    const list = await listProducts(
      new Request("http://localhost/api/products"),
    );
    const product = await readProduct(
      new Request("http://localhost/api/products/test"),
      { params: Promise.resolve({ productId: "vsa-annual-online-ballet" }) },
    );
    expect(list.status).toBe(503);
    expect(product.status).toBe(503);
    expect(await list.text()).not.toContain("Private internal");
    expect((await product.json()).status).toBe("catalog_unavailable");
  });
});
