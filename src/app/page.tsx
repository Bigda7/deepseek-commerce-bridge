import { loadCatalog } from "@/storage/catalog";
import { buildCommerceView } from "@/presentation/commerce";
import { CommerceDemo } from "@/components/commerce-demo";

export const dynamic = "force-dynamic";
export default async function DemoPage() {
  const catalog = await loadCatalog();
  const view = buildCommerceView(catalog, catalog.products[0].id);
  const liveEnabled = process.env.DEEPSEEK_API_ENABLED === "true";
  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="/">
          DeepSeek Commerce Bridge
        </a>
        <span className="badge">DeepSeek demo</span>
      </header>
      <section className="intro demo-intro">
        <h1>{view.name}</h1>
        <p className="lede">
          Ask about the program, prices and Saturday classes.
        </p>
      </section>
      <CommerceDemo
        initialView={view}
        initialDate={new Date().toISOString().slice(0, 10)}
        liveEnabled={liveEnabled}
        sessionNotice={
          liveEnabled ? process.env.DEEPSEEK_DEMO_NOTICE : undefined
        }
      />
      <footer>
        Demonstration only. No payments or enrollment are processed here.
      </footer>
    </main>
  );
}
