import type { CommerceView, CheckoutResponse } from "@/schemas/chat";
import { groupWarnings } from "@/presentation/warnings";

export function RawWarningList({
  warnings,
  title,
}: {
  warnings: CommerceView["warnings"];
  title: string;
}) {
  if (!warnings.length) return null;
  return (
    <section className="raw-diagnostics">
      <h3>{title}</h3>
      <ul className="unknowns">
        {warnings.map((warning, index) => (
          <li key={index}>
            <strong>{warning.field ?? warning.code}</strong>
            <span>
              {warning.message || "Further confirmation is required."}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WarningList({
  warnings,
  title = "Unconfirmed details",
}: {
  warnings: CommerceView["warnings"];
  title?: string;
}) {
  if (!warnings.length) return null;
  return (
    <details className="warning-details">
      <summary>{title}</summary>
      <ul className="unknowns">
        {groupWarnings(warnings).map((group) => (
          <li key={group.topic}>
            <strong>{group.title}</strong>
            <span>{group.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CommerceEvidence({
  view,
  onRefresh,
  refreshing,
  onCheckout,
  checking,
  checkout,
  actionError,
}: {
  view: CommerceView;
  onRefresh: () => void;
  refreshing: boolean;
  onCheckout: () => void;
  checking: boolean;
  checkout: CheckoutResponse | null;
  actionError: string | null;
}) {
  return (
    <aside className="card evidence-card" aria-labelledby="product-heading">
      <div className="section-heading">
        <h2 id="product-heading">Program details</h2>
        <button
          className="text-button"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Updating..." : "Reload details"}
        </button>
      </div>
      <p>{view.description}</p>
      <div className="price">
        <strong>{view.price.display}</strong>
        <span className="badge observed">
          {view.price.status === "observed"
            ? "Observed price"
            : view.price.status}
        </span>
      </div>
      <p className="fine-print">
        {view.price.billing}
        {view.price.billingStatus === "confirmed"
          ? ""
          : ` (${view.price.billingStatus})`}
        .{" "}
        {view.price.status === "confirmed"
          ? "Configured price; provider terms and availability still require checking."
          : "Current price and any additional charges are not confirmed."}
      </p>
      <div className="truth-grid">
        <div>
          <span>Enrollment</span>
          <strong>
            {view.enrollment.availability === "unknown"
              ? "Not confirmed"
              : view.enrollment.availability}
          </strong>
        </div>
        <div>
          <span>Access dates</span>
          <strong>{view.access.startDate ?? "Not confirmed"}</strong>
        </div>
      </div>
      <dl className="facts">
        {view.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>
              {fact.value}
              {fact.status !== "confirmed" && fact.value !== "Unknown" && (
                <span className="fact-status">{fact.status}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="notice">
        Enrollment availability and the start and end of your one-year access
        have not been confirmed.
      </p>
      <div className="actions">
        {view.checkout.reviewUrl ? (
          <a
            className="button"
            href={`/api/products/${view.productId}/review-checkout`}
            target="_blank"
            rel="noreferrer"
          >
            Review checkout terms
          </a>
        ) : (
          <p className="notice">
            The saved checkout link cannot currently be verified. Review the
            official program page for current terms.
          </p>
        )}
        <p className="fine-print">
          {view.checkout.reviewUrl
            ? "This saved link is for reviewing terms; enrollment and the final total remain unconfirmed."
            : "Reloading these details does not check the business website."}
        </p>
        <button
          className="outline-button"
          onClick={onCheckout}
          disabled={checking}
        >
          {checking ? "Checking..." : "Check enrollment"}
        </button>
        <a
          className="secondary"
          href={view.landingUrl}
          target="_blank"
          rel="noreferrer"
        >
          Official program page
        </a>
      </div>
      {checkout && (
        <section className="action-result" aria-live="polite">
          <h3>
            {checkout.status === "ok"
              ? "Configured terms are ready for review"
              : "Enrollment cannot be confirmed"}
          </h3>
          <p>
            {checkout.status === "ok"
              ? "No payment or enrollment has been completed."
              : "Some required conditions are unconfirmed. No payment or enrollment has been completed."}
          </p>
          <WarningList
            warnings={checkout.warnings}
            title="What needs confirmation"
          />
        </section>
      )}
      {actionError && (
        <p role="alert" className="notice">
          {actionError}
        </p>
      )}
      <WarningList warnings={view.warnings} />
    </aside>
  );
}
