import { z } from "zod";
import {
  completionSchema,
  ProviderError,
  type ChatMessage,
  type CompletionTransport,
} from "@/adapters/deepseek/contracts";
import {
  executeTool,
  toolDefinitions,
  type ToolContext,
  type ToolResult,
} from "@/tools/registry";
import { commerceSystemPrompt } from "@/assistant/prompt";
import { hasUnverifiedLinks } from "@/assistant/links";
import { dateClarification } from "@/assistant/date-clarification";
import { assistantInputSchema } from "@/schemas/chat";
export { assistantInputSchema } from "@/schemas/chat";

const limitsSchema = z.strictObject({
  maxProviderRequests: z.number().int().min(1).max(8).default(5),
  maxToolCalls: z.number().int().min(1).max(20).default(12),
  maxTokens: z.number().int().min(64).max(4096).default(1024),
  requestTimeoutMs: z.number().int().min(1).max(60000).default(15000),
  turnTimeoutMs: z.number().int().min(1).max(120000).default(60000),
  maxContextBytes: z.number().int().min(4096).max(262144).default(131072),
  maxToolResultBytes: z.number().int().min(1024).max(65536).default(32768),
});
type Limits = z.input<typeof limitsSchema>;
export type ToolTrace = { callId: string; name: string; result: ToolResult };

async function completeWithinDeadline(
  transport: CompletionTransport,
  request: Parameters<CompletionTransport["complete"]>[0],
  timeoutMs: number,
  parent?: AbortSignal,
) {
  if (parent?.aborted) throw new ProviderError("request_cancelled");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError("provider_timeout"));
    }, timeoutMs);
    onAbort = () => {
      controller.abort();
      reject(new ProviderError("request_cancelled"));
    };
    parent?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      transport.complete(request, controller.signal),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
    parent?.removeEventListener("abort", onAbort);
  }
}

export async function runAssistantTurn(
  input: unknown,
  context: ToolContext,
  transport: CompletionTransport,
  options: { limits?: Limits; signal?: AbortSignal } = {},
) {
  const traces: ToolTrace[] = [];
  const completions: { id: string; model: string; finishReason: string }[] = [];
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reportedRequests: 0,
    unreportedRequests: 0,
  };
  let providerRequests = 0;
  const metadata = () => ({
    provider: "deepseek" as const,
    mode: transport.mode,
    requestedModel: transport.model,
    catalogVersion: context.catalog.version,
    providerRequests,
    usage,
    completions,
    toolTrace: traces,
  });
  const failure = (status: string, message: string, retryable = false) => ({
    ...metadata(),
    status,
    message,
    retryable,
    text: null,
  });
  const parsed = assistantInputSchema.safeParse(input);
  if (!parsed.success)
    return failure(
      "invalid_input",
      "Provide a bounded conversation with user/assistant text and a final user message.",
    );
  const limits = limitsSchema.safeParse(options.limits ?? {});
  if (!limits.success)
    return failure("invalid_configuration", "Assistant limits are invalid.");
  const policy = limits.data;
  const referenceTime = (context.domainOptions?.clock ?? (() => new Date()))();
  if (!Number.isFinite(referenceTime.getTime()))
    return failure("invalid_configuration", "The reference clock is invalid.");
  if (
    context.displayedProductId &&
    !context.catalog.products.some(
      (product) => product.id === context.displayedProductId,
    )
  )
    return failure(
      "invalid_configuration",
      "The displayed product is not in the catalog.",
    );
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: commerceSystemPrompt(
        referenceTime.toISOString(),
        context.displayedProductId,
      ),
    },
    ...parsed.data.messages,
  ];
  const usedIds = new Set<string>();
  const startedAt = performance.now();
  try {
    if (options.signal?.aborted) throw new ProviderError("request_cancelled");
    const clarification = dateClarification(parsed.data.messages);
    if (clarification)
      return {
        ...metadata(),
        status: "ok",
        text: clarification,
        responseOrigin: "application_clarification" as const,
        retryable: false,
      };
    while (providerRequests < policy.maxProviderRequests) {
      if (options.signal?.aborted) throw new ProviderError("request_cancelled");
      if (
        Buffer.byteLength(JSON.stringify(messages), "utf8") >
        policy.maxContextBytes
      )
        return failure(
          "context_limit",
          "The tool conversation exceeded the configured context size.",
        );
      const remainingMs =
        policy.turnTimeoutMs - (performance.now() - startedAt);
      if (remainingMs <= 0) throw new ProviderError("provider_timeout");
      providerRequests++;
      usage.unreportedRequests++;
      const raw = await completeWithinDeadline(
        transport,
        {
          messages: structuredClone(messages),
          tools: structuredClone(toolDefinitions),
          toolChoice: providerRequests === 1 ? "required" : "auto",
          maxTokens: policy.maxTokens,
        },
        Math.min(policy.requestTimeoutMs, remainingMs),
        options.signal,
      );
      const response = completionSchema.safeParse(raw);
      if (!response.success || response.data.model !== transport.model)
        throw new ProviderError("provider_invalid_response");
      const completion = response.data;
      if (completion.usage) {
        usage.promptTokens += completion.usage.prompt_tokens;
        usage.completionTokens += completion.usage.completion_tokens;
        usage.totalTokens += completion.usage.total_tokens;
        usage.reportedRequests++;
        usage.unreportedRequests--;
      }
      const choice = completion.choices[0];
      completions.push({
        id: completion.id,
        model: completion.model,
        finishReason: choice.finish_reason,
      });
      const calls = choice.message.tool_calls ?? [];
      if (choice.finish_reason === "stop" && calls.length === 0) {
        if (!choice.message.content?.trim())
          throw new ProviderError("provider_invalid_response");
        if (!traces.some((trace) => trace.result.status === "ok"))
          return failure(
            "grounding_unavailable",
            "No catalog tool completed successfully; an ungrounded answer was withheld.",
          );
        if (hasUnverifiedLinks(choice.message.content, context.catalog, traces))
          return failure(
            "unverified_response",
            "The response included a destination that was not established by catalog tools. The answer was withheld.",
          );
        return {
          ...metadata(),
          status: "ok",
          text: choice.message.content,
          retryable: false,
        };
      }
      if (choice.finish_reason !== "tool_calls")
        return failure(
          "incomplete_response",
          "The provider did not finish a complete answer. Partial content was withheld.",
        );
      if (
        !calls.length ||
        calls.some((call) => usedIds.has(call.id)) ||
        new Set(calls.map((call) => call.id)).size !== calls.length
      )
        throw new ProviderError("provider_invalid_response");
      if (traces.length + calls.length > policy.maxToolCalls)
        return failure(
          "tool_limit",
          "The assistant reached the configured tool-call limit.",
        );
      if (providerRequests === policy.maxProviderRequests)
        return failure(
          "request_limit",
          "The assistant reached the configured provider-request limit.",
        );
      messages.push(choice.message);
      for (const call of calls) {
        usedIds.add(call.id);
        let result = executeTool(
          call.function.name,
          call.function.arguments,
          context,
        );
        if (
          Buffer.byteLength(JSON.stringify(result), "utf8") >
          policy.maxToolResultBytes
        )
          result = {
            status: "tool_unavailable",
            catalogVersion: context.catalog.version,
            message:
              "Tool data exceeds the configured size limit; do not infer the omitted facts.",
          };
        traces.push({ callId: call.id, name: call.function.name, result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    return failure(
      "request_limit",
      "The assistant reached the configured provider-request limit.",
    );
  } catch (error) {
    if (error instanceof ProviderError)
      return failure(error.code, error.message, error.retryable);
    return failure(
      "provider_unavailable",
      "The provider operation failed. Internal details were withheld.",
    );
  }
}
