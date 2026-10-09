import type { Product } from "@/schemas/catalog";

export function formatCatalogPrice(value: Product["facts"]["price"]["value"]) {
  if (value === null) return "Unknown";
  // All currencies supported by the catalog schema have two minor-unit digits.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency,
    currencyDisplay: "code",
  })
    .format(value.amountMinor / 100)
    .replaceAll("\u00a0", " ");
}
