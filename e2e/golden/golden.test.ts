import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { scan } from "@euscan/core";
import { loadCatalog } from "@euscan/rules";
import type { ScanResult } from "@euscan/shared";
import { collectFiles } from "../../apps/cli/src/collect.js";

/** Hand-checked ground truth for one golden repo (see docs/specs/golden-repos.md). */
const ExpectedSchema = z.object({
  repo: z.string().min(1),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  mustFind: z.array(z.string().min(1)),
  mustNotFind: z.array(z.string().min(1)),
  knownFalsePositives: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1),
});
type Expected = z.infer<typeof ExpectedSchema>;

const MIN_RECALL = 0.9;
const GOLDEN_DIR = fileURLToPath(new URL(".", import.meta.url));

interface GoldenRepo {
  name: string;
  expected: Expected;
  snapshotDir: string;
}

function loadGoldenRepos(): GoldenRepo[] {
  return readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(GOLDEN_DIR, entry.name, "expected.json")))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      expected: ExpectedSchema.parse(JSON.parse(readFileSync(join(GOLDEN_DIR, name, "expected.json"), "utf8"))),
      snapshotDir: join(GOLDEN_DIR, name, "snapshot"),
    }));
}

/** Services reported from runtime dependencies or env templates (not devDependency-only noise). */
function reportedServices(result: ScanResult): Set<string> {
  return new Set(result.findings.filter((f) => f.dependencyKind !== "dev").map((f) => f.serviceId));
}

const catalog = loadCatalog();
const repos = loadGoldenRepos();
const results = new Map<string, ScanResult>(
  repos.map((repo) => [repo.name, scan(collectFiles(repo.snapshotDir), catalog)]),
);

function resultFor(name: string): ScanResult {
  const result = results.get(name);
  if (result === undefined) throw new Error(`no scan result for ${name}`);
  return result;
}

describe("golden repos", () => {
  it("has the 10 repos from the spec", () => {
    expect(repos).toHaveLength(10);
  });

  it("only expects services that exist in the catalog", () => {
    const ids = new Set(catalog.services.map((s) => s.id));
    for (const { name, expected } of repos) {
      for (const id of [...expected.mustFind, ...expected.mustNotFind, ...expected.knownFalsePositives]) {
        expect(ids.has(id), `${name}: unknown service id "${id}"`).toBe(true);
      }
    }
  });

  it.each(repos.map((r) => [r.name, r] as const))("%s: never reports a mustNotFind service", (_name, repo) => {
    const reported = reportedServices(resultFor(repo.name));
    expect(repo.expected.mustNotFind.filter((id) => reported.has(id))).toEqual([]);
  });

  it.each(repos.map((r) => [r.name, r] as const))("%s: devDependencies are never personal data", (_name, repo) => {
    const ranked = resultFor(repo.name).findings.filter(
      (f) => f.dependencyKind === "dev" && f.bucket !== "noise",
    );
    expect(ranked).toEqual([]);
  });

  it.each(repos.map((r) => [r.name, r] as const))("%s: output is deterministic", (_name, repo) => {
    const again = scan(collectFiles(repo.snapshotDir), catalog);
    expect(JSON.stringify(again)).toBe(JSON.stringify(resultFor(repo.name)));
  });

  it(`reaches at least ${MIN_RECALL * 100}% recall overall`, () => {
    let expectedTotal = 0;
    let foundTotal = 0;
    const rows: string[] = [];
    for (const { name, expected } of repos) {
      const result = resultFor(name);
      const reported = reportedServices(result);
      const found = expected.mustFind.filter((id) => reported.has(id));
      const missed = expected.mustFind.filter((id) => !reported.has(id));
      const extra = [...reported].filter((id) => !expected.mustFind.includes(id)).sort();
      expectedTotal += expected.mustFind.length;
      foundTotal += found.length;
      rows.push(
        `${name.padEnd(11)} grade ${result.grade}  found ${found.length}/${expected.mustFind.length}` +
          `  missed [${missed.join(", ")}]  extra [${extra.join(", ")}]`,
      );
    }
    const recall = expectedTotal === 0 ? 1 : foundTotal / expectedTotal;
    console.log(`Golden repos (recall ${foundTotal}/${expectedTotal} = ${recall.toFixed(3)})\n${rows.join("\n")}`);
    expect(recall).toBeGreaterThanOrEqual(MIN_RECALL);
  });
});
