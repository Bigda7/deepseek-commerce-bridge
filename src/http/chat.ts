export function isLocalSameOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("Host") ?? url.host;
  let visibleOrigin: URL;
  try {
    visibleOrigin = new URL(`${url.protocol}//${host}`);
  } catch {
    return false;
  }
  return (
    ["127.0.0.1", "localhost", "[::1]"].includes(visibleOrigin.hostname) &&
    request.headers.get("Origin") === visibleOrigin.origin &&
    request.headers.get("Sec-Fetch-Site") !== "cross-site"
  );
}

export function createChatGate(now: () => number = Date.now) {
  let active = false;
  let starts: number[] = [];
  return {
    acquire() {
      const current = now();
      starts = starts.filter((time) => current - time < 60000);
      if (active || starts.length >= 4) return null;
      active = true;
      starts.push(current);
      let released = false;
      return () => {
        if (!released) {
          active = false;
          released = true;
        }
      };
    },
  };
}
export function chatHttpStatus(status: string) {
  if (status === "ok") return 200;
  if (status === "invalid_input") return 400;
  if (status === "provider_balance") return 402;
  if (status === "provider_rate_limited") return 429;
  if (status === "request_cancelled") return 499;
  if (status === "provider_timeout") return 504;
  if (
    [
      "provider_disabled",
      "provider_configuration",
      "provider_authentication",
      "provider_unavailable",
      "catalog_unavailable",
    ].includes(status)
  )
    return 503;
  return 502;
}
