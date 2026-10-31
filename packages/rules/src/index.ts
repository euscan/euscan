/**
 * Loads and validates the EUscan catalog (services/*.yaml, alternatives/*.yaml).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  AlternativeSchema,
  ServiceRuleSchema,
  type Alternative,
  type Catalog,
  type ServiceRule,
} from "@euscan/shared";

/** One parsed YAML document and the file it came from. */
export interface CatalogDocument {
  file: string;
  data: unknown;
}

/** Thrown when one or more catalog files are invalid; lists every problem found. */
export class CatalogError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid catalog:\n- ${problems.join("\n- ")}`);
    this.name = "CatalogError";
    this.problems = problems;
  }
}

/** The folder holding `services/` and `alternatives/` (the package root). */
export const DEFAULT_CATALOG_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Used as the catalog version when the catalog has no entries. */
export const EMPTY_CATALOG_VERSION = "unversioned";

const fileStem = (file: string): string => {
  const name = file.split(/[\\/]/).pop() ?? file;
  return name.slice(0, name.length - extname(name).length);
};

/**
 * Validates parsed catalog documents and cross-checks them.
 * Pure: no disk access. Throws `CatalogError` listing every problem.
 */
export function buildCatalog(
  serviceDocs: readonly CatalogDocument[],
  alternativeDocs: readonly CatalogDocument[],
): Catalog {
  const problems: string[] = [];
  const services: ServiceRule[] = [];
  const alternatives: Alternative[] = [];

  for (const doc of serviceDocs) {
    const result = ServiceRuleSchema.safeParse(doc.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${doc.file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    if (result.data.id !== fileStem(doc.file)) {
      problems.push(`${doc.file}: id "${result.data.id}" must match the file name`);
    }
    services.push(result.data);
  }

  for (const doc of alternativeDocs) {
    const result = AlternativeSchema.safeParse(doc.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${doc.file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    if (result.data.id !== fileStem(doc.file)) {
      problems.push(`${doc.file}: id "${result.data.id}" must match the file name`);
    }
    alternatives.push(result.data);
  }

  const seen = new Set<string>();
  for (const entry of [...services, ...alternatives]) {
    if (seen.has(entry.id)) problems.push(`duplicate id "${entry.id}"`);
    seen.add(entry.id);
  }

  const alternativeIds = new Set(alternatives.map((a) => a.id));
  for (const service of services) {
    for (const altId of service.alternatives) {
      if (!alternativeIds.has(altId)) {
        problems.push(`services/${service.id}.yaml: alternative "${altId}" has no file in alternatives/`);
      }
    }
  }

  if (problems.length > 0) throw new CatalogError(problems);

  const dates = [...services, ...alternatives].map((e) => e.last_verified_at).sort();
  const version = dates.at(-1) ?? EMPTY_CATALOG_VERSION;

  const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  services.sort(byId);
  alternatives.sort(byId);
  return { services, alternatives, version };
}

/** Reads every `.yaml`/`.yml` file in a folder, sorted by name. A missing folder gives []. */
export function readYamlDocuments(dir: string): CatalogDocument[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      return { file: name, data: parse(readFileSync(path, "utf8")) as unknown };
    });
}

/** Loads and validates the catalog from disk. Defaults to the catalog shipped with this package. */
export function loadCatalog(rootDir: string = DEFAULT_CATALOG_DIR): Catalog {
  return buildCatalog(
    readYamlDocuments(join(rootDir, "services")),
    readYamlDocuments(join(rootDir, "alternatives")),
  );
}
