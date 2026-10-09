import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers";
import next from "next";
import { importLocal } from "./local-typescript.mjs";

const interview = process.argv.includes("--interview-session");
if (!process.argv.includes("--start-live-session")) {
  console.log(
    interview
      ? "Prepared only: interview demo, twelve attempts, thirty provider requests, USD 0.10 estimate target, sixty minutes. No network calls."
      : "Prepared only: loopback, six chat attempts, thirty provider requests, USD 0.10 estimate target, twenty minutes. No network calls.",
  );
  process.exit(0);
}
const runId = interview
  ? "Interview-session-" + new Date().toISOString().replace(/[:.]/g, "-")
  : process.argv.includes("--reviewed-navigation-session")
    ? "P8-practice-session-04"
    : process.argv.includes("--reviewed-context-session")
      ? "P8-practice-session-03"
      : process.argv.includes("--reviewed-recovery-session")
        ? "P8-practice-session-02"
        : "P8-practice-session-01";
const evidenceDate = interview
  ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(
      new Date(),
    )
  : "2026-10-07";
const directory = resolve("docs/evidence/connected", evidenceDate, runId);
const recordPath = resolve(directory, "session.json");
const key = process.env.DEEPSEEK_API_KEY;
if (!key || /\s/.test(key)) throw new Error("Invalid local credential.");
await mkdir(directory, { recursive: true });
await writeFile(
  recordPath,
  JSON.stringify({ status: "preflight", startedAt: new Date().toISOString() }) +
    "\n",
  { flag: "wx" },
);
const originalFetch = globalThis.fetch.bind(globalThis);
const balanceResponse = await originalFetch(
  "https://api.deepseek.com/user/balance",
  {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: globalThis.AbortSignal.timeout(15000),
  },
);
if (!balanceResponse.ok)
  throw new Error("Balance check failed; no generation enabled.");
const balance = await balanceResponse.json();
const balanceUsd = balance.balance_infos?.find(
  (item) => item.currency === "USD",
)?.total_balance;
if (!balance.is_available || balanceUsd === undefined || Number(balanceUsd) < 1)
  throw new Error("Insufficient reserve; no generation enabled.");
const { DemoSessionBudget } = await importLocal("src/demo/session-budget.ts");
const budget = new DemoSessionBudget(30, 0.1);
const state = {
  runId,
  status: "preparing",
  startedAt: new Date().toISOString(),
  timeZone: "Europe/Budapest",
  model: "deepseek-flash",
  balanceBeforeUsd: balanceUsd,
  maxChatAttempts: interview ? 12 : 6,
  sessionMinutes: interview ? 60 : 20,
  estimateTargetUsd: budget.targetUsd,
  maxProviderRequests: budget.maxRequests,
  pricingSource: "https://api-docs.deepseek.com/quick_start/pricing/",
  pricingVerifiedOn: "2026-10-07",
  billingCaveat:
    "Conservative peak/cache-miss estimate guard; not an absolute provider billing cap. Missing usage or transport failure halts generation with its reservation retained.",
  chatAttempts: 0,
  rejectedChatRequests: 0,
  completions: [],
  userPrompts: [],
  turns: [],
};
let saveQueue = Promise.resolve();
const save = () => {
  const snapshot =
    JSON.stringify({ ...state, budget }, null, 2).replaceAll(
      key,
      "[REDACTED]",
    ) + "\n";
  saveQueue = saveQueue.then(async () => {
    await writeFile(recordPath + ".tmp", snapshot);
    await rename(recordPath + ".tmp", recordPath);
  });
  return saveQueue;
};
await save();
process.env.DEEPSEEK_API_ENABLED = "true";
process.env.DEEPSEEK_MODEL = "deepseek-flash";
process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
process.env.DEEPSEEK_DEMO_NOTICE = interview
  ? "Interview demo: up to 12 messages in 60 minutes, with a finite API estimate guard. No payment or enrollment is processed."
  : "Practice session: up to 6 messages in 20 minutes. No payment or enrollment is processed.";

globalThis.fetch = async (input, options) => {
  const url = typeof input === "string" ? input : (input.url ?? String(input));
  if (url !== "https://api.deepseek.com/chat/completions")
    return originalFetch(input, options);
  const body = typeof options?.body === "string" ? options.body : "";
  const payload = JSON.parse(body);
  if (
    payload.model !== "deepseek-flash" ||
    payload.thinking?.type !== "disabled"
  ) {
    budget.fail("unsupported_provider_configuration");
    await save();
    throw new Error("Unsupported practice configuration.");
  }
  budget.reserve(Buffer.byteLength(body, "utf8"), payload.max_tokens);
  if (!state.userPrompts.some((item) => item.attempt === state.chatAttempts)) {
    state.userPrompts.push({
      attempt: state.chatAttempts,
      at: new Date().toISOString(),
      messages: payload.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    });
  }
  await save();
  try {
    const response = await originalFetch(input, options);
    if (!response.ok) {
      budget.fail("provider_failure");
      await save();
      return response;
    }
    const clone = response.clone();
    const chunks = [];
    let bytes = 0;
    for await (const chunk of clone.body) {
      bytes += chunk.byteLength;
      if (bytes > 262144) throw new Error("Provider capture limit.");
      chunks.push(Buffer.from(chunk));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    budget.settle(data.usage?.prompt_tokens, data.usage?.completion_tokens);
    if (data.model !== "deepseek-flash") budget.fail("model_mismatch");
    state.completions.push({
      id: data.id,
      model: data.model,
      usage: data.usage,
      finalText:
        data.choices?.[0]?.finish_reason === "stop"
          ? data.choices[0].message?.content
          : null,
      at: new Date().toISOString(),
    });
    await save();
    return response;
  } catch {
    budget.fail("provider_response_unreported");
    await save();
    throw new Error("Practice provider request failed; no automatic retry.");
  }
};

if (interview) await mkdir(resolve("tmp"), { recursive: true });
const application = next({ dev: false, hostname: "127.0.0.1", port: 3001 });
await application.prepare();
const handle = application.getRequestHandler();
let activeChat = false;
let expiresAt = 0;
function reject(response, status, message) {
  state.rejectedChatRequests++;
  void save();
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ status: "practice_session_limited", message }));
}
const server = createServer((request, response) => {
  const route = request.url?.split("?")[0];
  const isChat = request.method === "POST" && route === "/api/chat";
  if (request.method === "POST" && !isChat && route !== "/api/checkout")
    return reject(response, 403, "This practice route is not available.");
  if (isChat) {
    if (
      request.headers.origin !== "http://127.0.0.1:3001" ||
      request.headers.host !== "127.0.0.1:3001"
    )
      return reject(
        response,
        403,
        "Open this practice session from its local address.",
      );
    if (activeChat)
      return reject(
        response,
        429,
        "Wait for the current answer before sending another question.",
      );
    if (
      state.chatAttempts >= state.maxChatAttempts ||
      budget.stoppedReason ||
      Date.now() + 65000 >= expiresAt
    ) {
      process.env.DEEPSEEK_API_ENABLED = "false";
      return reject(
        response,
        429,
        "This limited practice session has ended. No additional model request was sent.",
      );
    }
    activeChat = true;
    state.chatAttempts++;
    const attempt = state.chatAttempts;
    void save();
    request.headers["accept-encoding"] = "identity";
    const chunks = [];
    let bytes = 0;
    const capture = (chunk, encoding) => {
      if (chunk === undefined || chunk === null || typeof chunk === "function")
        return;
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(
            chunk,
            typeof encoding === "string" ? encoding : undefined,
          );
      bytes += buffer.byteLength;
      if (bytes <= 524288) chunks.push(buffer);
    };
    const originalWrite = response.write;
    const originalEnd = response.end;
    response.write = function (...args) {
      capture(args[0], args[1]);
      return originalWrite.apply(this, args);
    };
    response.end = function (...args) {
      capture(args[0], args[1]);
      return originalEnd.apply(this, args);
    };
    response.once("close", () => {
      activeChat = false;
    });
    response.once("finish", async () => {
      activeChat = false;
      let result;
      try {
        result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        budget.fail("route_response_capture_failed");
      }
      state.turns.push({
        attempt,
        status: response.statusCode,
        capturedAt: new Date().toISOString(),
        result,
      });
      if (
        result?.status &&
        !["ok", "chat_busy", "invalid_input"].includes(result.status)
      )
        budget.fail("turn_failed_review_required");
      if (state.chatAttempts >= state.maxChatAttempts || budget.stoppedReason)
        process.env.DEEPSEEK_API_ENABLED = "false";
      await save();
      console.log(
        JSON.stringify({
          attempt,
          status: result?.status,
          providerRequests: budget.requests,
          estimatedUsd: budget.estimatedUsd,
          stopReason: budget.stoppedReason,
        }),
      );
    });
  }
  void handle(request, response);
});
server.listen(3001, "127.0.0.1", () => {
  expiresAt = Date.now() + state.sessionMinutes * 60_000;
  state.expiresAt = new Date(expiresAt).toISOString();
  state.status = "ready_for_user_practice";
  void save();
  console.log(
    interview
      ? "Interview demo ready at http://127.0.0.1:3001. Twelve attempts, sixty minutes, USD 0.10 conservative estimate target. No automatic generation."
      : "Practice ready at http://127.0.0.1:3001. Six attempts, twenty minutes, USD 0.10 conservative estimate target. No automatic generation.",
  );
  if (interview)
    void writeFile(
      resolve("tmp/interview-demo-process.json"),
      JSON.stringify({
        pid: process.pid,
        recordPath,
        expiresAt: state.expiresAt,
      }),
    ).catch(() => {
      console.error(
        "Process marker could not be written. Stop this demo with Ctrl+C.",
      );
    });
  setTimeout(() => {
    process.env.DEEPSEEK_API_ENABLED = "false";
    state.status = "closed";
    state.closedAt = new Date().toISOString();
    void save().finally(() => {
      server.closeAllConnections();
      server.close();
      void application.close().finally(() => process.exit(0));
    });
  }, state.sessionMinutes * 60_000).unref();
});
