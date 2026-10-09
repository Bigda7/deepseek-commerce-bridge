import { assistantInputSchema, warningSchema } from "@/schemas/chat";
import { z } from "zod";
import { respondWithDeepSeek } from "@/assistant/service";
import { loadCatalog } from "@/storage/catalog";
import { buildCommerceView } from "@/presentation/commerce";
import { commerceError, readLimitedJson } from "@/http/commerce";
import { isLocalSameOrigin, createChatGate, chatHttpStatus } from "@/http/chat";

export const dynamic = "force-dynamic";
const gate = createChatGate();
export async function POST(request: Request) {
  if (!isLocalSameOrigin(request))
    return commerceError(
      403,
      "origin_not_allowed",
      "Chat is available only from this local application's origin.",
    );
  if (request.signal.aborted)
    return commerceError(
      499,
      "request_cancelled",
      "The request was cancelled.",
    );
  const body = await readLimitedJson(request, 65536);
  if (body.status !== 200)
    return commerceError(
      body.status,
      "invalid_input",
      "Send a JSON conversation no larger than 65536 bytes.",
    );
  const parsed = assistantInputSchema.safeParse(body.value);
  if (!parsed.success)
    return commerceError(
      400,
      "invalid_input",
      "Provide bounded user/assistant text with a final user message. Start a new conversation if its history is full.",
    );
  const release = gate.acquire();
  if (!release)
    return commerceError(
      429,
      "chat_busy",
      "One chat request can run at a time, with up to four starts per minute. Wait briefly and try again.",
    );
  try {
    const catalog = await loadCatalog();
    const view = buildCommerceView(catalog, catalog.products[0].id);
    const result = await respondWithDeepSeek(parsed.data, {
      signal: request.signal,
      catalog,
      displayedProductId: view.productId,
    });
    const toolNotices =
      "toolTrace" in result
        ? result.toolTrace.map((trace) => ({
            name: trace.name,
            status: trace.result.status,
            message: trace.result.message,
          }))
        : [];
    const toolWarnings =
      "toolTrace" in result
        ? result.toolTrace.flatMap((trace) => {
            const envelope = z
              .object({ warnings: z.array(warningSchema) })
              .safeParse(trace.result.data);
            return envelope.success ? envelope.data.warnings : [];
          })
        : [];
    return Response.json(
      { ...result, view, toolNotices, toolWarnings },
      {
        status: chatHttpStatus(result.status),
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return commerceError(
      503,
      "catalog_unavailable",
      "The catalog could not be loaded. No answer was generated from missing data.",
    );
  } finally {
    release();
  }
}
