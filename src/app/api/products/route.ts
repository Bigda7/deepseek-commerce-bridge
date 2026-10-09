import { searchProducts } from "@/domain/catalog";
import { productSearchSchema } from "@/schemas/api";
import { loadCatalog } from "@/storage/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = productSearchSchema.safeParse(Object.fromEntries(params));
  if (
    !parsed.success ||
    [...params.keys()].some((key) => params.getAll(key).length > 1)
  ) {
    return Response.json(
      {
        status: "invalid_input",
        message:
          "Use a query of up to 500 characters and an optional businessId.",
      },
      { status: 400 },
    );
  }
  try {
    const catalog = await loadCatalog();
    return Response.json(
      {
        status: "ok",
        catalogVersion: catalog.version,
        data: searchProducts(catalog, parsed.data.q, parsed.data.businessId),
        scope:
          "The catalog contains the annual online group ballet program only.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "catalog_unavailable",
        message: "The catalog could not be loaded or validated.",
      },
      { status: 503 },
    );
  }
}
