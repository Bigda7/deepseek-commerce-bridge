import { loadCatalog } from "@/storage/catalog";
import { getEnrollmentOption } from "@/domain/checkout";
import { productIdSchema } from "@/schemas/catalog";
import {
  commerceError,
  handleCommerce,
  type ProductRouteContext,
} from "@/http/commerce";

export const dynamic = "force-dynamic";
export async function GET(request: Request, route: ProductRouteContext) {
  const { productId } = await route.params;
  if (
    !productIdSchema.safeParse(productId).success ||
    new URL(request.url).search
  )
    return commerceError(
      400,
      "invalid_input",
      "Only a known product path is accepted.",
    );
  return handleCommerce(async () => {
    const option = getEnrollmentOption(await loadCatalog(), productId);
    if (!option.data.url)
      return Response.json(option, {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    return new Response(null, {
      status: 303,
      headers: { Location: option.data.url, "Cache-Control": "no-store" },
    });
  });
}
