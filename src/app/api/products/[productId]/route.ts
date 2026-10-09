import { getProductRecord } from "@/domain/catalog";
import { productIdSchema } from "@/schemas/catalog";
import { loadCatalog } from "@/storage/catalog";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;
  if (!productIdSchema.safeParse(productId).success) {
    return Response.json(
      { status: "invalid_input", message: "Invalid product ID." },
      { status: 400 },
    );
  }
  try {
    const catalog = await loadCatalog();
    const record = getProductRecord(catalog, productId);
    if (!record)
      return Response.json(
        {
          status: "unknown_product",
          message: "This product is not in the catalog.",
        },
        { status: 404 },
      );
    return Response.json(
      { status: "ok", data: record },
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
