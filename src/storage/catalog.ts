import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeCatalog } from "@/ingestion/normalize-catalog";

export async function loadCatalog() {
  const directory = join(process.cwd(), "data");
  const [observations, overrides] = await Promise.all([
    readFile(join(directory, "observations", "victory-skating.json"), "utf8"),
    readFile(join(directory, "overrides", "business-approved.json"), "utf8"),
  ]);
  return normalizeCatalog(JSON.parse(observations), JSON.parse(overrides));
}
