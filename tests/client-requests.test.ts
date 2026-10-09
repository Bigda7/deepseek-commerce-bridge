import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendChat,
  checkCheckout,
  checkSessions,
  refreshCommerceView,
} from "@/client/requests";
import { prepareCheckout } from "@/domain/checkout";
import { buildCommerceView } from "@/presentation/commerce";
import { observedCatalog, productId, fixedClock } from "./fixtures/commerce";
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("browser request contracts with mocked fetch", () => {
  it("preserves disabled API responses and sends no client authorization claims", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          status: "provider_disabled",
          text: null,
          providerRequests: 0,
          message: "Disabled",
        },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(
      await sendChat([{ role: "user", content: "hello" }], signal),
    ).toMatchObject({ status: "provider_disabled", providerRequests: 0 });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(signal);
  });
  it("retains blocked checkout results instead of treating HTTP 409 as a network failure", async () => {
    const result = prepareCheckout(
      observedCatalog(),
      { productId, intent: "enroll" },
      { clock: fixedClock },
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(result, { status: 409 })),
    );
    expect(await checkCheckout(productId)).toMatchObject({
      status: "blocked",
      data: { paymentConfirmed: false, url: null },
    });
  });
  it("sends a full calendar date and explicit user zone with encoded parameters", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { status: "invalid_input", message: "Use a recognized IANA zone." },
          { status: 400 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkSessions(productId, "2026-11-06", "EDT")).rejects.toThrow(
      "recognized IANA",
    );
    expect(fetchMock.mock.calls[0][0]).toContain("referenceDate=2026-11-06");
    expect(fetchMock.mock.calls[0][0]).toContain("userTimeZone=EDT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("validates the independent view before updating browser state", async () => {
    const view = buildCommerceView(observedCatalog(), productId, {
      clock: fixedClock,
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(view))
      .mockResolvedValueOnce(
        Response.json({ ...view, landingUrl: "javascript:alert(1)" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await refreshCommerceView(productId)).toMatchObject({ productId });
    await expect(refreshCommerceView(productId)).rejects.toThrow(
      "unsupported response",
    );
  });
  it("forwards cancellation without retrying", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pending = sendChat(
      [{ role: "user", content: "hello" }],
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
