import { describe, expect, it } from "vitest";
import { dateClarification } from "@/assistant/date-clarification";
import { runAssistantTurn } from "@/assistant/runner";
import { observedCatalog, fixedClock } from "./fixtures/commerce";
import { scriptedTransport } from "./fixtures/deepseek";

describe("explicit date clarification before provider requests", () => {
  it.each([
    "Can I join on November 6?",
    "Can I join on 6 November?",
    "Can I join on Nov. 6th?",
    "Можно записаться 6 ноября?",
  ])("asks for a missing year: %s", (content) => {
    expect(dateClarification([{ role: "user", content }])).toBeTruthy();
  });
  it("does not take an observation year or a date from assistant history", async () => {
    const transport = scriptedTransport([]);
    const result = await runAssistantTurn(
      {
        messages: [
          {
            role: "user",
            content:
              "What is included and how much does it cost? Is it a one-time payment?",
          },
          {
            role: "assistant",
            content:
              "Observed on 2026-10-06; https://victoryskating.com/balletgroupprogram",
          },
          { role: "user", content: "Can I join on November 6?" },
        ],
      },
      { catalog: observedCatalog(), domainOptions: { clock: fixedClock } },
      transport.transport,
    );
    expect(result).toMatchObject({
      status: "ok",
      responseOrigin: "application_clarification",
      providerRequests: 0,
      toolTrace: [],
      completions: [],
    });
    expect(transport.complete).not.toHaveBeenCalled();
    expect(result.text).not.toMatch(/2026|friday|saturday|https:/i);
  });
  it("accepts explicit years and matching dates confirmed by the user", () => {
    expect(
      dateClarification([
        { role: "user", content: "Can I join on November 6, 2026?" },
      ]),
    ).toBeNull();
    expect(
      dateClarification([
        { role: "user", content: "I mean 6 November 2026." },
        { role: "assistant", content: "Okay." },
        { role: "user", content: "Can I join on November 6?" },
      ]),
    ).toBeNull();
  });
  it("does not reuse a year from a different user date", () => {
    expect(
      dateClarification([
        { role: "user", content: "October 6, 2026" },
        { role: "user", content: "Can I join on November 6?" },
      ]),
    ).toBeTruthy();
  });
  it("leaves full ISO dates and other questions to the existing tools", () => {
    for (const content of [
      "Can I join on 2026-11-06?",
      "What does the program cost?",
      "Is it available next Saturday?",
      "I mean November 6, 2026. My time zone is Europe/Budapest.",
    ])
      expect(dateClarification([{ role: "user", content }])).toBeNull();
  });
  it("does not ignore another ambiguous date alongside an explicit one", () => {
    expect(
      dateClarification([
        { role: "user", content: "November 6 or December 4, 2026?" },
      ]),
    ).toBeTruthy();
  });
});
