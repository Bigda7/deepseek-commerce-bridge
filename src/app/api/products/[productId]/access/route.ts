import { getAccessPeriod } from "@/domain/access";
import { productIdSchema } from "@/schemas/catalog";
import { accessQuerySchema } from "@/schemas/commerce";
import {
  commerceError,
  handleCommerce,
  parseQuery,
  type ProductRouteContext,
} from "@/http/commerce";
import { loadCatalog } from "@/storage/catalog";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: ProductRouteContext) {
  const { productId } = await context.params;
  const query = parseQuery(request, accessQuerySchema);
  if (!productIdSchema.safeParse(productId).success || !query)
    return commerceError(
      400,
      "invalid_input",
      "Use an optional activationDate (YYYY-MM-DD) and activationEvent. A supplied event is not verified payment evidence.",
    );
  return handleCommerce(async () =>
    Response.json(getAccessPeriod(await loadCatalog(), productId, query), {
      headers: { "Cache-Control": "no-store" },
    }),
  );
}
