import { vi } from "vitest";
import type {
  CompletionRequest,
  CompletionTransport,
} from "@/adapters/deepseek/contracts";

export const fixtureModel = "deepseek-flash";
export function completion(
  content = "Offline fixture answer; not a real DeepSeek evaluation.",
) {
  return {
    id: "offline-fixture-completion",
    model: fixtureModel,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
  };
}
export function toolCall(
  name: string,
  arguments_: unknown,
  id = "fixture-call-1",
) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(arguments_) },
  };
}
export function toolCompletion(calls: ReturnType<typeof toolCall>[]) {
  return {
    ...completion(),
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: { role: "assistant", content: null, tool_calls: calls },
      },
    ],
  };
}
export function scriptedTransport(responses: unknown[]) {
  const requests: CompletionRequest[] = [];
  const complete = vi.fn(async (request: CompletionRequest) => {
    requests.push(structuredClone(request));
    if (requests.length > responses.length)
      throw new Error("Offline fixture exhausted");
    return responses[requests.length - 1];
  });
  const transport: CompletionTransport = {
    mode: "offline_test_fixture",
    model: fixtureModel,
    complete,
  };
  return { transport, requests, complete };
}
