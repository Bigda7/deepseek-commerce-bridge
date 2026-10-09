import { notFound } from "next/navigation";
import { getProductRecord } from "@/domain/catalog";
import { productIdSchema } from "@/schemas/catalog";
import { loadCatalog } from "@/storage/catalog";

export const dynamic = "force-dynamic";

export default async function ProductDataPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  if (!productIdSchema.safeParse(productId).success) notFound();
  const record = getProductRecord(await loadCatalog(), productId);
  if (!record) notFound();

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="/">
          DeepSeek Commerce Bridge
        </a>
        <span className="badge">Read-only catalog</span>
      </header>
      <section className="intro">
        <p className="eyebrow">Structured product record</p>
        <h1>
          Facts, sources
          <br />
          <span>and uncertainty.</span>
        </h1>
        <p className="lede">
          The same validated record is available to the JSON API and future
          assistant tools.
        </p>
        <div className="actions">
          <a href={`/api/products/${productId}`}>Open JSON API</a>
          <a href="/">Back to the catalog</a>
        </div>
      </section>
      <pre className="json-record" aria-label="Structured product data">
        {JSON.stringify(record, null, 2)}
      </pre>
    </main>
  );
}
