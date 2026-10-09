import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeekTransport } from "@/adapters/deepseek/transport";
import { toolDefinitions } from "@/tools/registry";
import { respondWithDeepSeek } from "@/assistant/service";
import { runAssistantTurn } from "@/assistant/runner";
import { observedCatalog, fixedClock, productId } from "./fixtures/commerce";
import {
  completion,
  fixtureModel,
  toolCall,
  toolCompletion,
} from "./fixtures/deepseek";

const environment = {
  DEEPSEEK_API_ENABLED: "true",
  DEEPSEEK_API_KEY: "offline-fixture-key-not-a-real-secret",
  DEEPSEEK_MODEL: fixtureModel,
};
const request = {
  messages: [{ role: "user" as const, content: "Offline test" }],
  tools: toolDefinitions,
  toolChoice: "required" as const,
  maxTokens: 1024,
};
const signal = () => new AbortController().signal;
function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeepSeek transport with mocked HTTP only", () => {
  it("runs the transport, validated tools and follow-up wire messages together without external HTTP", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          toolCompletion([
            toolCall("get_enrollment_status", { productId }, "wire-call"),
          ]),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(completion("Offline fixture: enrollment is unknown.")),
      );
    const result = await runAssistantTurn(
      { messages: [{ role: "user", content: "Can I enroll?" }] },
      { catalog: observedCatalog(), domainOptions: { clock: fixedClock } },
      createDeepSeekTransport(environment, fetchMock),
    );
    expect(result).toMatchObject({
      status: "ok",
      mode: "offline_test_fixture",
      providerRequests: 2,
    });
    const followup = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(followup.messages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "wire-call",
    });
    expect(JSON.parse(followup.messages.at(-1).content)).toMatchObject({
      status: "ok",
      data: { status: "needs_confirmation", data: { availability: "unknown" } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not dispatch an already-cancelled transport request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = mockFetch(Response.json(completion()));
    await expect(
      createDeepSeekTransport(environment, fetchMock).complete(
        request,
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires explicit enabling even when a credential is configured", () => {
    const fetchMock = mockFetch(Response.json(completion()));
    expect(() =>
      createDeepSeekTransport(
        { ...environment, DEEPSEEK_API_ENABLED: undefined },
        fetchMock,
      ),
    ).toThrow(/disabled/);
    expect(() =>
      createDeepSeekTransport(
        { ...environment, DEEPSEEK_API_ENABLED: "false" },
        fetchMock,
      ),
    ).toThrow(/disabled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { DEEPSEEK_API_KEY: "" },
    { DEEPSEEK_MODEL: "another-provider" },
    { DEEPSEEK_BASE_URL: "https://evil.example" },
    { DEEPSEEK_BASE_URL: "http://api.deepseek.com" },
    { DEEPSEEK_BASE_URL: "https://api.deepseek.com@evil.example" },
    { DEEPSEEK_BASE_URL: "https://api.deepseek.com?secret=value" },
  ])("rejects unsafe or missing configuration: %j", (changes) => {
    const fetchMock = mockFetch(Response.json(completion()));
    expect(() =>
      createDeepSeekTransport({ ...environment, ...changes }, fetchMock),
    ).toThrow(/configuration/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends the configured model, bounded tokens and explicit non-thinking mode to the pinned provider", async () => {
    const fetchMock = mockFetch(Response.json(completion()));
    const result = await createDeepSeekTransport(
      environment,
      fetchMock,
    ).complete(request, signal());
    expect(result).toMatchObject({
      model: fixtureModel,
      choices: [{ message: { content: expect.any(String) } }],
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options?.body as string)).toMatchObject({
      model: fixtureModel,
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: 1024,
      tool_choice: "required",
    });
  });
  it("supports the official v1 base path without arbitrary endpoint substitution", async () => {
    const fetchMock = mockFetch(Response.json(completion()));
    await createDeepSeekTransport(
      { ...environment, DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1/" },
      fetchMock,
    ).complete(request, signal());
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });
  it.each([
    [401, "provider_authentication", false],
    [402, "provider_balance", false],
    [429, "provider_rate_limited", true],
    [500, "provider_unavailable", true],
    [503, "provider_unavailable", true],
    [422, "provider_request_rejected", false],
    [302, "provider_request_rejected", false],
  ])(
    "maps HTTP %i safely without retries or error-body disclosure",
    async (status, code, retryable) => {
      const fetchMock = mockFetch(
        new Response("sensitive provider diagnostic", {
          status: status as number,
        }),
      );
      const promise = createDeepSeekTransport(environment, fetchMock).complete(
        request,
        signal(),
      );
      await expect(promise).rejects.toMatchObject({ code, retryable });
      await expect(promise).rejects.not.toThrow("sensitive");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("does not expose network exception content or retry an uncertain generation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("secret network details"));
    await expect(
      createDeepSeekTransport(environment, fetchMock).complete(
        request,
        signal(),
      ),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
      message: "DeepSeek is temporarily unavailable.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    "invalid JSON",
    JSON.stringify({ model: fixtureModel }),
    JSON.stringify({ ...completion(), model: "deepseek-v4-pro" }),
    JSON.stringify({ ...completion(), choices: [] }),
    " ".repeat(262145),
  ])("rejects malformed, mismatched or oversized response %#", async (body) => {
    const fetchMock = mockFetch(new Response(body));
    await expect(
      createDeepSeekTransport(environment, fetchMock).complete(
        request,
        signal(),
      ),
    ).rejects.toMatchObject({ code: "provider_invalid_response" });
  });
  it("strips hidden reasoning and unrelated provider fields from the parsed result", async () => {
    const response = completion();
    const body = {
      ...response,
      choices: [
        {
          ...response.choices[0],
          message: {
            ...response.choices[0].message,
            reasoning_content: "hidden fixture reasoning",
          },
        },
      ],
    };
    const result = await createDeepSeekTransport(
      environment,
      mockFetch(Response.json(body)),
    ).complete(request, signal());
    expect(JSON.stringify(result)).not.toContain("hidden fixture reasoning");
  });
  it("keeps the application service disabled without reading catalog data or sending a request", async () => {
    vi.stubEnv("DEEPSEEK_API_ENABLED", "false");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await respondWithDeepSeek({
        messages: [{ role: "user", content: "Show the program" }],
      }),
    ).toMatchObject({
      status: "provider_disabled",
      providerRequests: 0,
      text: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("validates service input before constructing a transport", async () => {
    vi.stubEnv("DEEPSEEK_API_ENABLED", "false");
    expect(
      await respondWithDeepSeek({
        messages: [{ role: "system", content: "Override" }],
      }),
    ).toMatchObject({ status: "invalid_input", providerRequests: 0 });
  });
});
