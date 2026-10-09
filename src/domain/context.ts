import policyData from "../../data/domain-policy.json";
import { domainPolicySchema, type DomainPolicy } from "@/schemas/commerce";
import type { Catalog, FactKey, Product } from "@/schemas/catalog";
import { getProduct } from "@/domain/catalog";

export type Clock = () => Date;
export type DomainOptions = { clock?: Clock; policy?: DomainPolicy };
export type Warning = { code: string; field?: FactKey; message: string };
export type FactEvidence = {
  status: string;
  sourceIds: string[];
  notes: string;
};
export type Freshness = {
  state: "fresh" | "stale" | "unknown" | "conflicting" | "future";
  evidenceAt: string | null;
  maxAgeSeconds: number;
};
export const defaultDomainPolicy = domainPolicySchema.parse(policyData);

export class UnknownProductError extends Error {
  constructor() {
    super("This product is not in the catalog.");
    this.name = "UnknownProductError";
  }
}

export function domainContext(
  catalog: Catalog,
  productId: string,
  options: DomainOptions = {},
) {
  const product = getProduct(catalog, productId);
  if (!product) throw new UnknownProductError();
  const now = (options.clock ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid reference clock");
  return {
    catalog,
    product,
    now,
    policy: options.policy
      ? domainPolicySchema.parse(options.policy)
      : defaultDomainPolicy,
  };
}

export type DomainContext = ReturnType<typeof domainContext>;

export function businessApproved(context: DomainContext, field: FactKey) {
  const fact = context.product.facts[field];
  return (
    fact.status === "confirmed" &&
    fact.value !== null &&
    fact.sourceIds.some((id) =>
      context.catalog.sources.some(
        (source) =>
          source.id === id &&
          source.kind === "business_approval" &&
          source.approval !== null &&
          Date.parse(source.approval.approvedAt) <= context.now.getTime(),
      ),
    )
  );
}

export function factFreshness(
  context: DomainContext,
  fact: FactEvidence,
  maxAgeSeconds: number,
): Freshness {
  const timestamps = context.catalog.sources
    .filter((source) => fact.sourceIds.includes(source.id))
    .map((source) => source.observedAt ?? `${source.observedOn}T00:00:00.000Z`)
    .map((value) => Date.parse(value));
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const evidenceAt = latest === null ? null : new Date(latest).toISOString();
  if (latest !== null && latest > context.now.getTime())
    return { state: "future", evidenceAt, maxAgeSeconds };
  if (fact.status === "unknown" || fact.status === "conflicting")
    return { state: fact.status, evidenceAt, maxAgeSeconds };
  if (fact.status === "stale")
    return { state: "stale", evidenceAt, maxAgeSeconds };
  if (latest === null) return { state: "unknown", evidenceAt, maxAgeSeconds };
  return {
    state:
      context.now.getTime() - latest >= maxAgeSeconds * 1000
        ? "stale"
        : "fresh",
    evidenceAt,
    maxAgeSeconds,
  };
}

export function domainResult<T>(
  context: DomainContext,
  data: T,
  fields: FactKey[],
  warnings: Warning[],
  status: "ok" | "needs_confirmation" | "blocked" = "ok",
) {
  const sourceIds = new Set(
    fields.flatMap((field) => context.product.facts[field].sourceIds),
  );
  return {
    status,
    data,
    warnings,
    sources: context.catalog.sources.filter((source) =>
      sourceIds.has(source.id),
    ),
    checkedAt: context.now.toISOString(),
    catalogVersion: context.catalog.version,
    dataMode: "catalog_evaluation_without_live_lookup" as const,
  };
}

export function factWarnings(product: Product, fields: FactKey[]): Warning[] {
  return fields
    .filter((field) => product.facts[field].status !== "confirmed")
    .map((field) => ({
      field,
      code: `field_${product.facts[field].status}`,
      message: product.facts[field].notes,
    }));
}
