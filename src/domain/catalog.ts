import type { Catalog, Product } from "@/schemas/catalog";
import { formatCatalogPrice } from "@/domain/money";

export function getProduct(
  catalog: Catalog,
  productId: string,
): Product | undefined {
  return catalog.products.find((product) => product.id === productId);
}

export function getProductRecord(catalog: Catalog, productId: string) {
  const product = getProduct(catalog, productId);
  if (!product) return null;
  const observations = catalog.observations.filter(
    (item) => item.productId === product.id,
  );
  const sourceIds = new Set([
    ...Object.values(product.facts).flatMap((fact) => fact.sourceIds),
    ...observations.flatMap((observation) => observation.sourceIds),
  ]);
  return {
    catalogVersion: catalog.version,
    business: catalog.businesses.find(
      (business) => business.id === product.businessId,
    ),
    product,
    priceDisplay: formatCatalogPrice(product.facts.price.value),
    observations,
    sources: catalog.sources.filter((source) => sourceIds.has(source.id)),
    warnings: Object.entries(product.facts)
      .filter(([, fact]) => fact.status !== "confirmed")
      .map(([field, fact]) => ({
        field,
        status: fact.status,
        message: fact.notes,
      })),
    dataMode: "manual_source_observations" as const,
  };
}

export function searchProducts(
  catalog: Catalog,
  query = "",
  businessId?: string,
) {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = new Set(normalized.split(" "));
  const hasBalletIntent = tokens.has("ballet");
  const asksPrivate = /\b(private|individual|one on one)\b/.test(normalized);
  const asksMonthly = /\b(monthly|month to month)\b/.test(normalized);
  const hasAnnualIntent = /\b(annual|year|yearly)\b/.test(normalized);

  return catalog.products.flatMap((product) => {
    const business = catalog.businesses.find(
      (item) => item.id === product.businessId,
    );
    if (!business || (businessId && businessId !== business.id)) return [];
    if ((asksPrivate || asksMonthly) && !hasAnnualIntent) return [];
    const matchReasons: string[] = [];
    if (!normalized) matchReasons.push("catalog_listing");
    if (businessId) matchReasons.push("explicit_business_context");
    const fullName = business.name.toLowerCase();
    if (normalized.includes(fullName)) matchReasons.push("business_name");
    if (
      hasBalletIntent &&
      (tokens.has("online") || hasAnnualIntent || tokens.has("vsa"))
    ) {
      matchReasons.push("online_ballet_intent");
    }
    if (matchReasons.length === 0) return [];
    return [
      {
        productId: product.id,
        businessId: business.id,
        name: product.facts.name.value,
        landingUrl: product.landingUrl,
        matchReasons,
      },
    ];
  });
}
