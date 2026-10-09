import type { ToolTrace } from "@/assistant/runner";
import type { Catalog } from "@/schemas/catalog";

export function hasUnverifiedLinks(
  text: string,
  catalog: Catalog,
  traces: ToolTrace[],
) {
  const allowed = new Set<string>();
  for (const trace of traces) {
    if (trace.result.status !== "ok") continue;
    const navigation = trace.result.navigation;
    const resolved = catalog.products.find(
      (product) => product.id === navigation?.productId,
    );
    if (resolved && navigation?.landingUrl === resolved.landingUrl)
      allowed.add(resolved.landingUrl);
    const payload = trace.result.data as Record<string, unknown> | undefined;
    if (!payload) continue;
    if (trace.name === "search_products" && Array.isArray(payload.matches)) {
      for (const match of payload.matches) {
        const product = catalog.products.find(
          (item) => item.id === match.productId,
        );
        if (product && match.landingUrl === product.landingUrl)
          allowed.add(product.landingUrl);
      }
    }
    if (trace.name === "get_product") {
      const record = payload.product as { id?: string } | undefined;
      const product = catalog.products.find((item) => item.id === record?.id);
      if (product) allowed.add(product.landingUrl);
    }
    if (Array.isArray(payload.sources)) {
      const ids = new Set(
        payload.sources.map((source: { id?: string }) => source.id),
      );
      for (const source of catalog.sources)
        if (
          ids.has(source.id) &&
          source.kind === "website_observation" &&
          source.location.startsWith("https://")
        )
          allowed.add(source.location);
    }
    if (
      trace.name === "get_enrollment_option" ||
      trace.name === "prepare_checkout"
    ) {
      const data = payload.data as { url?: unknown } | undefined;
      if (payload.status !== "blocked" && typeof data?.url === "string")
        allowed.add(data.url);
    }
  }
  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return urls.some((url) => !allowed.has(url.replace(/[)\].,;!?]+$/, "")));
}
