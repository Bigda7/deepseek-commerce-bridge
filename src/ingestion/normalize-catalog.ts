import { createHash } from "node:crypto";
import {
  catalogSchema,
  overridesSchema,
  type Catalog,
} from "@/schemas/catalog";

export function normalizeCatalog(
  observations: unknown,
  approvalOverrides: unknown,
): Catalog {
  const catalog = catalogSchema.parse(observations);
  const overrides = overridesSchema.parse(approvalOverrides);
  const resolved = structuredClone(catalog);
  const changedFields = new Set<string>();

  for (const change of overrides.changes) {
    const product = resolved.products.find(
      (item) => item.id === change.productId,
    );
    if (!product)
      throw new Error(
        `Override references an unknown product: ${change.productId}`,
      );
    const sourceId = `approval-${change.id}`;
    if (resolved.sources.some((source) => source.id === sourceId)) {
      throw new Error(`Duplicate approval source: ${sourceId}`);
    }
    resolved.sources.push({
      id: sourceId,
      title: `Business approval: ${change.id}`,
      kind: "business_approval",
      location: "data/overrides/business-approved.json",
      observedOn: change.approval.approvedAt.slice(0, 10),
      observedAt: change.approval.approvedAt,
      approval: change.approval,
    });
    const approvedFacts = Object.fromEntries(
      Object.entries(change.facts).map(([key, fact]) => {
        const fieldId = `${product.id}:${key}`;
        if (changedFields.has(fieldId)) {
          throw new Error(
            `Multiple overrides for the same product field: ${fieldId}`,
          );
        }
        changedFields.add(fieldId);
        return [
          key,
          {
            value: fact.value,
            notes: fact.notes,
            status: "confirmed",
            sourceIds: [sourceId],
          },
        ];
      }),
    );
    Object.assign(product.facts, approvedFacts);
    resolved.updatedOn = [
      resolved.updatedOn,
      change.approval.approvedAt.slice(0, 10),
    ]
      .sort()
      .at(-1)!;
  }

  const digest = createHash("sha256")
    .update(JSON.stringify({ observations, approvalOverrides }))
    .digest("hex")
    .slice(0, 16);
  resolved.version = `${catalog.version}+${overrides.version}.${digest}`;
  return catalogSchema.parse(resolved);
}
