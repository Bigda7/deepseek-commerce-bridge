import {
  chatResponseSchema,
  commerceViewSchema,
  checkoutResponseSchema,
  sessionResponseSchema,
  type ConversationMessage,
} from "@/schemas/chat";
import type { z } from "zod";

async function requestJson<T extends z.ZodType>(
  url: string,
  schema: T,
  options: RequestInit = {},
): Promise<z.output<T>> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body: unknown = await response.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message.slice(0, 500)
        : "The server returned an unsupported response. Your input has been kept.";
    throw new Error(message);
  }
  return parsed.data;
}
export function sendChat(messages: ConversationMessage[], signal: AbortSignal) {
  return requestJson("/api/chat", chatResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
}
export function refreshCommerceView(productId: string, signal?: AbortSignal) {
  return requestJson(
    `/api/products/${encodeURIComponent(productId)}/view`,
    commerceViewSchema,
    { signal },
  );
}
export function checkCheckout(productId: string, signal?: AbortSignal) {
  return requestJson(`/api/checkout`, checkoutResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, intent: "enroll" }),
    signal,
  });
}
export function checkSessions(
  productId: string,
  referenceDate: string,
  userTimeZone: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ referenceDate, limit: "3" });
  if (userTimeZone.trim()) params.set("userTimeZone", userTimeZone.trim());
  return requestJson(
    `/api/products/${encodeURIComponent(productId)}/sessions?${params}`,
    sessionResponseSchema,
    { signal },
  );
}
