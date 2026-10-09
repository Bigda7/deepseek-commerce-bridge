import { z } from "zod";
import {
  completionSchema,
  ProviderError,
  type CompletionTransport,
} from "@/adapters/deepseek/contracts";

const configSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[^\s]+$/),
  model: z.enum(["deepseek-flash", "deepseek-v4-pro"]),
  baseUrl: z.enum([
    "https://api.deepseek.com",
    "https://api.deepseek.com/",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com/v1/",
  ]),
});
type Environment = Record<string, string | undefined>;

async function readResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("provider_invalid_response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 262144) {
        await reader.cancel();
        throw new ProviderError("provider_invalid_response");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ProviderError("provider_invalid_response");
  }
}

export function createDeepSeekTransport(
  environment: Environment,
  fetchImpl: typeof fetch = fetch,
): CompletionTransport {
  if (typeof window !== "undefined")
    throw new ProviderError("provider_configuration");
  if (environment.DEEPSEEK_API_ENABLED !== "true")
    throw new ProviderError("provider_disabled");
  const parsed = configSchema.safeParse({
    apiKey: environment.DEEPSEEK_API_KEY,
    model: environment.DEEPSEEK_MODEL,
    baseUrl: environment.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  });
  if (!parsed.success) throw new ProviderError("provider_configuration");
  const config = parsed.data;
  return {
    mode: fetchImpl === fetch ? "live_deepseek" : "offline_test_fixture",
    model: config.model,
    async complete(request, signal) {
      if (signal.aborted) throw new ProviderError("request_cancelled");
      try {
        const response = await fetchImpl(
          `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
          {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: config.model,
              messages: request.messages,
              tools: request.tools,
              tool_choice: request.toolChoice,
              max_tokens: request.maxTokens,
              stream: false,
              thinking: { type: "disabled" },
            }),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          const code = response.status;
          if (code === 401) throw new ProviderError("provider_authentication");
          if (code === 402) throw new ProviderError("provider_balance");
          if (code === 429)
            throw new ProviderError("provider_rate_limited", true);
          if (code >= 500)
            throw new ProviderError("provider_unavailable", true);
          throw new ProviderError("provider_request_rejected");
        }
        const result = completionSchema.safeParse(await readResponse(response));
        if (!result.success || result.data.model !== config.model)
          throw new ProviderError("provider_invalid_response");
        return result.data;
      } catch (error) {
        if (signal.aborted) throw new ProviderError("request_cancelled");
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("provider_unavailable");
      }
    },
  };
}
