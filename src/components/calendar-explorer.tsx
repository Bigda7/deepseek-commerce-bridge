"use client";
import { useEffect, useRef, useState } from "react";
import { checkSessions } from "@/client/requests";
import { WarningList } from "@/components/commerce-evidence";
import type { SessionResponse } from "@/schemas/chat";

export function CalendarExplorer({
  productId,
  initialDate,
}: {
  productId: string;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [zone, setZone] = useState("");
  const [result, setResult] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await checkSessions(
        productId,
        date,
        zone,
        controller.signal,
      );
      if (active.current === controller) setResult(response);
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Could not check dates. Check the date and time zone (for example, Europe/Budapest), then try again.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <details className="card calendar-card">
      <summary>Check class dates</summary>
      <p>
        Find possible Saturday classes. Dates are tentative until confirmed.
      </p>
      <form onSubmit={submit} className="calendar-form">
        <label>
          Starting from
          <input
            type="date"
            required
            min="1900-01-01"
            max="2200-12-31"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Your time zone <span className="fine-print">optional</span>
          <input
            placeholder="Europe/Budapest"
            value={zone}
            maxLength={100}
            onChange={(event) => setZone(event.target.value)}
            disabled={busy}
          />
        </label>
        <button className="outline-button" disabled={busy}>
          {busy ? "Checking dates..." : "Show possible dates"}
        </button>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="calendar-result" aria-live="polite">
          <p>
            <strong>{result.data.referenceDate}</strong> is{" "}
            <strong className="capitalize">
              {result.data.referenceWeekday}
            </strong>
            .
          </p>
          <ul className="candidate-list">
            {result.data.candidates.map((candidate) => (
              <li key={candidate.programDate}>
                <strong>{candidate.programDate}</strong>
                <span className="badge observed">{candidate.status}</span>
                <span>
                  {candidate.userLocalStart
                    ? `${candidate.userLocalStart.date} ${candidate.userLocalStart.time} (${candidate.userLocalStart.timeZone})`
                    : (candidate.startsAt ?? "Exact time unknown")}
                </span>
              </li>
            ))}
          </ul>
          <p className="fine-print">
            These dates do not confirm individual classes or reserve a place.
          </p>
          <WarningList
            warnings={result.warnings}
            title="Calendar limitations"
          />
        </div>
      )}
    </details>
  );
}
