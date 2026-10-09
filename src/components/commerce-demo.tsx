"use client";
import { useEffect, useRef, useState } from "react";
import {
  assistantInputSchema,
  type CommerceView,
  type ConversationMessage,
  type ChatResponse,
  type CheckoutResponse,
} from "@/schemas/chat";
import {
  sendChat,
  refreshCommerceView,
  checkCheckout,
} from "@/client/requests";
import {
  CommerceEvidence,
  WarningList,
  RawWarningList,
} from "@/components/commerce-evidence";
import { CalendarExplorer } from "@/components/calendar-explorer";

const suggestions = [
  "Does VSA have online ballet for beginners?",
  "What is included and how much does it cost?",
  "Can I join on November 6, 2026?",
];
type DisplayMessage = ConversationMessage & {
  responseOrigin?: "application_clarification";
};
export function MessageBubble({ message }: { message: DisplayMessage }) {
  return (
    <article className={`message ${message.role}`}>
      <strong>
        {message.role === "user"
          ? "You"
          : message.responseOrigin === "application_clarification"
            ? "Date clarification"
            : "DeepSeek"}
      </strong>
      <p>{message.content}</p>
    </article>
  );
}

export function CommerceDemo({
  initialView,
  initialDate,
  liveEnabled,
  sessionNotice,
}: {
  initialView: CommerceView;
  initialDate: string;
  liveEnabled: boolean;
  sessionNotice?: string;
}) {
  const [view, setView] = useState(initialView);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attempt, setAttempt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ChatResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const evidenceRequest = useRef<AbortController | null>(null);
  const checkoutRequest = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      evidenceRequest.current?.abort();
      checkoutRequest.current?.abort();
    },
    [],
  );
  function cancel() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setFeedback(
      "Request cancelled. Your question has been kept. A cancelled live request may still have provider usage.",
    );
    inputRef.current?.focus();
  }
  function reset() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setMessages([]);
    setAttempt(null);
    setDraft("");
    setFeedback(null);
    setLastResult(null);
    inputRef.current?.focus();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !draft.trim()) return;
    const outgoing: ConversationMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: "user", content: draft.trim() },
    ];
    if (!assistantInputSchema.safeParse({ messages: outgoing }).success) {
      setFeedback(
        "This conversation has reached its input limit. Start a new conversation; your current question remains in the field.",
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 75000);
    setBusy(true);
    setFeedback(null);
    setAttempt(draft.trim());
    setLastResult(null);
    try {
      const response = await sendChat(outgoing, controller.signal);
      if (active.current !== controller) return;
      if (response.view) setView(response.view);
      setLastResult(response);
      if (response.status === "ok" && response.text) {
        setMessages([
          ...messages,
          { role: "user", content: draft.trim() },
          {
            role: "assistant",
            content: response.text,
            responseOrigin: response.responseOrigin,
          },
        ]);
        setAttempt(null);
        setDraft("");
      } else
        setFeedback(
          response.status === "provider_disabled"
            ? "Chat is turned off. You can still check program details and dates."
            : (response.message ??
                `The request could not complete (${response.status}). Your question has been kept.`),
        );
    } catch {
      if (active.current === controller)
        setFeedback(
          timedOut
            ? "The request timed out. Your question has been kept; no automatic retry was sent."
            : "The server could not be reached. Your question has been kept; try again when ready.",
        );
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  async function refresh() {
    if (evidenceRequest.current) return;
    const controller = new AbortController();
    evidenceRequest.current = controller;
    setRefreshing(true);
    setActionError(null);
    try {
      setView(await refreshCommerceView(view.productId, controller.signal));
      setCheckout(null);
    } catch {
      if (!controller.signal.aborted)
        setActionError(
          "The catalog could not be refreshed. Previously displayed data has been kept.",
        );
    } finally {
      evidenceRequest.current = null;
      setRefreshing(false);
    }
  }
  async function readiness() {
    if (checkoutRequest.current) return;
    const controller = new AbortController();
    checkoutRequest.current = controller;
    setChecking(true);
    setActionError(null);
    setCheckout(null);
    try {
      setCheckout(await checkCheckout(view.productId, controller.signal));
    } catch {
      if (!controller.signal.aborted)
        setActionError(
          "Enrollment readiness could not be checked. No purchase was completed.",
        );
    } finally {
      checkoutRequest.current = null;
      setChecking(false);
    }
  }
  return (
    <>
      <div className="demo-grid">
        <div className="conversation-column">
          <section className="card chat-card" aria-labelledby="chat-heading">
            <div className="section-heading">
              <h2 id="chat-heading">Ask a question</h2>
              <button className="text-button" onClick={reset}>
                New conversation
              </button>
            </div>
            {sessionNotice && (
              <p className="fine-print" role="status">
                {sessionNotice}
              </p>
            )}
            <div
              className={`mode-notice ${liveEnabled ? "" : "generation-off"}`}
            >
              {liveEnabled
                ? "Chat is on · Powered by DeepSeek"
                : "Chat is off · Program details and date checks are available."}
            </div>
            <div
              className="conversation"
              role="log"
              aria-label="Conversation messages"
              aria-live="polite"
              aria-busy={busy}
            >
              {!messages.length && !attempt && (
                <div className="empty-chat">
                  <h3>Is this program right for you?</h3>
                  <p>Choose a question below or write your own.</p>
                </div>
              )}
              {messages.map((message, index) => (
                <MessageBubble message={message} key={index} />
              ))}
              {attempt && (
                <article className="message user">
                  <strong>You</strong>
                  <p>{attempt}</p>
                </article>
              )}
              {busy && <p className="working">Checking program details...</p>}
            </div>
            {feedback && (
              <p className="notice chat-feedback" role="alert">
                {feedback}
              </p>
            )}
            {!!lastResult?.toolWarnings?.length && (
              <WarningList
                warnings={lastResult.toolWarnings}
                title="Answer limitations"
              />
            )}
            <div className="suggestions" aria-label="Example questions">
              {suggestions.map((question) => (
                <button
                  key={question}
                  onClick={() => {
                    setDraft(question);
                    inputRef.current?.focus();
                  }}
                  disabled={busy}
                >
                  {question}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="chat-form">
              <label htmlFor="chat-message">Your question</label>
              <textarea
                id="chat-message"
                ref={inputRef}
                value={draft}
                maxLength={4000}
                required
                rows={3}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask about the program, enrollment or class dates..."
                aria-describedby="chat-input-help"
              />
              <div className="composer-footer">
                <span className="fine-print" id="chat-input-help">
                  Ctrl+Enter to send · {draft.length}/4000
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="outline-button"
                    onClick={cancel}
                  >
                    Cancel request
                  </button>
                ) : (
                  <button className="button" disabled={!draft.trim()}>
                    Send message
                  </button>
                )}
              </div>
            </form>
            <p className="fine-print">
              Reloading or opening a new tab starts a new conversation.
            </p>
          </section>
          <CalendarExplorer
            productId={view.productId}
            initialDate={initialDate}
          />
        </div>
        <CommerceEvidence
          view={view}
          onRefresh={refresh}
          refreshing={refreshing}
          onCheckout={readiness}
          checking={checking}
          checkout={checkout}
          actionError={actionError}
        />
      </div>
      <details className="sources">
        <summary>Sources</summary>
        <div className="source-grid">
          {view.sources.map((source) => (
            <article className="source" key={source.id}>
              <h3>
                {
                  {
                    assignment: "Assignment",
                    website_observation: "Program page",
                    checkout_observation: "Checkout observation",
                    business_approval: "Business approval",
                  }[source.kind]
                }
              </h3>
              <p>Observed on {source.observedOn}</p>
              {source.kind === "website_observation" &&
                source.location === view.landingUrl && (
                  <a
                    className="secondary"
                    href={view.landingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official program page
                  </a>
                )}
              {source.approval && (
                <p>Approved by {source.approval.approvedBy}</p>
              )}
            </article>
          ))}
        </div>
      </details>
      <details className="demo-details">
        <summary>Demo details</summary>
        <p>
          This prototype uses a manually maintained catalog. It is separate from
          ordinary DeepSeek and does not perform live business lookups.
        </p>
        <p className="version">Catalog {view.catalogVersion}</p>
        <p className="fine-print">Evaluated at {view.checkedAt}</p>
        <a className="secondary" href={`/catalog/${view.productId}`}>
          View structured catalog
        </a>
        <details className="technical-sources">
          <summary>Source records</summary>
          {view.sources.map((source) => (
            <article className="source" key={source.id}>
              <h3>{source.title}</h3>
              <p className="source-location">{source.location}</p>
              <p>{source.observedAt ?? source.observedOn}</p>
            </article>
          ))}
        </details>
        <RawWarningList warnings={view.warnings} title="Catalog diagnostics" />
        {checkout && (
          <RawWarningList
            warnings={checkout.warnings}
            title="Enrollment diagnostics"
          />
        )}
        {!!lastResult?.toolWarnings?.length && (
          <RawWarningList
            warnings={lastResult.toolWarnings}
            title="Assistant tool diagnostics"
          />
        )}
        {lastResult && (
          <p className="fine-print request-meta">
            Status: {lastResult.status} · Provider requests:{" "}
            {lastResult.providerRequests ?? 0}
            {lastResult.requestedModel
              ? ` · Model: ${lastResult.requestedModel}`
              : ""}
          </p>
        )}
        {!!lastResult?.toolNotices?.length && (
          <ul>
            {lastResult.toolNotices.map((tool, index) => (
              <li key={index}>
                {tool.name}: {tool.status}
                {tool.message ? ` — ${tool.message}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="fine-print">
          Model replies are plain text. Links and enrollment checks are rendered
          separately from the catalog; no payment or access is confirmed here.
        </p>
      </details>
    </>
  );
}
