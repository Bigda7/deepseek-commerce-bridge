import { prepareCheckout } from "@/domain/checkout";
import { checkoutRequestSchema } from "@/schemas/commerce";
import {
  commerceError,
  handleCommerce,
  readLimitedJson,
} from "@/http/commerce";
import { loadCatalog } from "@/storage/catalog";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const body = await readLimitedJson(request);
  if (body.status !== 200)
    return commerceError(
      body.status,
      "invalid_input",
      "Send a JSON body no larger than 8192 bytes.",
    );
  const parsed = checkoutRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return commerceError(
      400,
      "invalid_input",
      "Provide a known productId and explicit intent: enroll. URLs and payment-status claims are not accepted.",
    );
  return handleCommerce(async () => {
    const result = prepareCheckout(await loadCatalog(), parsed.data);
    return Response.json(result, {
      status: result.status === "blocked" ? 409 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
