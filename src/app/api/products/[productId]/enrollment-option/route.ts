import { getEnrollmentOption } from "@/domain/checkout";
import { productRequest, type ProductRouteContext } from "@/http/commerce";

export const dynamic = "force-dynamic";
export function GET(request: Request, context: ProductRouteContext) {
  return productRequest(request, context, getEnrollmentOption);
}
