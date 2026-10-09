import { z } from "zod";
import { productIdSchema, type Catalog } from "@/schemas/catalog";
import { UnknownProductError } from "@/domain/context";
import { loadCatalog } from "@/storage/catalog";

export type ProductRouteContext = { params: Promise<{ productId: string }> };
const emptyQuery = z.strictObject({});
const noStore = { "Cache-Control": "no-store" };

export function commerceError(status: number, code: string, message: string) {
  return Response.json({ status: code, message }, { status, headers: noStore });
}

export async function handleCommerce<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof UnknownProductError)
      return commerceError(404, "unknown_product", error.message);
    if (error instanceof z.ZodError)
      return commerceError(
        503,
        "catalog_unavailable",
        "Commerce configuration could not be validated.",
      );
    console.error(
      "Commerce request failed while loading or evaluating catalog data.",
    );
    return commerceError(
      503,
      "catalog_unavailable",
      "Commerce data is temporarily unavailable.",
    );
  }
}

export async function productRequest<T>(
  request: Request,
  route: ProductRouteContext,
  operation: (catalog: Catalog, productId: string) => T,
) {
  const { productId } = await route.params;
  if (!productIdSchema.safeParse(productId).success)
    return commerceError(400, "invalid_input", "Invalid product ID.");
  if (
    !emptyQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams))
      .success
  )
    return commerceError(
      400,
      "invalid_input",
      "This endpoint does not accept query parameters.",
    );
  return handleCommerce(async () =>
    Response.json(operation(await loadCatalog(), productId), {
      headers: noStore,
    }),
  );
}

export function parseQuery<T extends z.ZodType>(request: Request, schema: T) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    return null;
  const parsed = schema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : null;
}

export async function readLimitedJson(request: Request, maxBytes = 8192) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return { status: 415 as const, value: null };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 as const, value: null };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return { status: 413 as const, value: null };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { status: 400 as const, value: null };
  } finally {
    reader.releaseLock();
  }
  try {
    return {
      status: 200 as const,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
    };
  } catch {
    return { status: 400 as const, value: null };
  }
}
