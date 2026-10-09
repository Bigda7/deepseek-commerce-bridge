import { loadCatalog } from "@/storage/catalog";
import { createDeepSeekTransport } from "@/adapters/deepseek/transport";
import { ProviderError } from "@/adapters/deepseek/contracts";
import { assistantInputSchema, runAssistantTurn } from "@/assistant/runner";
import type { Catalog } from "@/schemas/catalog";

export async function respondWithDeepSeek(
  input: unknown,
  options: {
    signal?: AbortSignal;
    checkoutAuthorizedProductIds?: ReadonlySet<string>;
    catalog?: Catalog;
    displayedProductId?: string;
  } = {},
) {
  if (!assistantInputSchema.safeParse(input).success)
    return {
      status: "invalid_input",
      text: null,
      message: "Invalid conversation input.",
      providerRequests: 0,
    };
  try {
    const transport = createDeepSeekTransport(process.env);
    const catalog = options.catalog ?? (await loadCatalog());
    return await runAssistantTurn(
      input,
      {
        catalog,
        displayedProductId: options.displayedProductId,
        checkoutAuthorizedProductIds: options.checkoutAuthorizedProductIds,
      },
      transport,
      { signal: options.signal },
    );
  } catch (error) {
    if (error instanceof ProviderError)
      return {
        status: error.code,
        text: null,
        message: error.message,
        providerRequests: 0,
      };
    return {
      status: "catalog_unavailable",
      text: null,
      message: "The catalog could not be loaded.",
      providerRequests: 0,
    };
  }
}
