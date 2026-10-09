import { z } from "zod";
import type { toolDefinitions } from "@/tools/registry";

export const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1).max(100),
    arguments: z.string().max(8192),
  }),
});
export const completionSchema = z.object({
  id: z.string().min(1).max(200),
  model: z.string().min(1).max(100),
  choices: z
    .array(
      z.object({
        index: z.literal(0),
        finish_reason: z.enum([
          "stop",
          "length",
          "content_filter",
          "tool_calls",
          "insufficient_system_resource",
          "aborted",
        ]),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().max(16000).nullable(),
          tool_calls: z.array(toolCallSchema).max(12).optional(),
        }),
      }),
    )
    .length(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type Completion = z.infer<typeof completionSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type CompletionRequest = {
  messages: ChatMessage[];
  tools: typeof toolDefinitions;
  toolChoice: "required" | "auto";
  maxTokens: number;
};
export type CompletionTransport = {
  mode: "live_deepseek" | "offline_test_fixture";
  model: string;
  complete: (
    request: CompletionRequest,
    signal: AbortSignal,
  ) => Promise<unknown>;
};

export type ProviderErrorCode =
  | "provider_disabled"
  | "provider_configuration"
  | "provider_authentication"
  | "provider_balance"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_invalid_response"
  | "provider_request_rejected"
  | "request_cancelled";
const messages: Record<ProviderErrorCode, string> = {
  provider_disabled:
    "Live DeepSeek requests are disabled. Enable them only after agreeing the testing budget.",
  provider_configuration:
    "DeepSeek server configuration is incomplete or invalid.",
  provider_authentication:
    "DeepSeek authentication failed. Check the server-side credential locally.",
  provider_balance:
    "DeepSeek reports insufficient balance. No alternative provider was used.",
  provider_rate_limited: "DeepSeek rate-limited the request. Try again later.",
  provider_unavailable: "DeepSeek is temporarily unavailable.",
  provider_timeout:
    "DeepSeek did not complete within the request deadline. Completion and billing may be unknown.",
  provider_invalid_response:
    "DeepSeek returned an unsupported or invalid response.",
  provider_request_rejected: "DeepSeek rejected the configured request.",
  request_cancelled:
    "The request was cancelled. Provider billing may be unknown.",
};
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly retryable = false,
  ) {
    super(messages[code]);
    this.name = "ProviderError";
  }
}
