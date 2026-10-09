"use client";

export default function CatalogError({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Catalog unavailable</p>
        <h1>The product data could not be loaded.</h1>
        <p>Please check the catalog configuration and try again.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
