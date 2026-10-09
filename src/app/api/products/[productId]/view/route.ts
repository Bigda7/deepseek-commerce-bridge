import { productRequest, type ProductRouteContext } from "@/http/commerce";
import { buildCommerceView } from "@/presentation/commerce";

export const dynamic = "force-dynamic";
export function GET(request: Request, route: ProductRouteContext) {
  return productRequest(request, route, (catalog, productId) =>
    buildCommerceView(catalog, productId),
  );
}
