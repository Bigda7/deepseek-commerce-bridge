import { getNextSessions } from "@/domain/schedule";
import { productIdSchema } from "@/schemas/catalog";
import { sessionQuerySchema } from "@/schemas/commerce";
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
  const query = parseQuery(request, sessionQuerySchema);
  if (!productIdSchema.safeParse(productId).success || !query)
    return commerceError(
      400,
      "invalid_input",
      "Provide a full referenceDate (YYYY-MM-DD), optional IANA userTimeZone, and limit from 1 to 12.",
    );
  return handleCommerce(async () =>
    Response.json(getNextSessions(await loadCatalog(), productId, query), {
      headers: { "Cache-Control": "no-store" },
    }),
  );
}
