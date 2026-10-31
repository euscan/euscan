import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  CatalogError,
  EMPTY_CATALOG_VERSION,
  loadCatalog,
  readYamlDocuments,
} from "@euscan/rules";

const service = (overrides: Record<string, unknown> = {}) => ({
  id: "resend",
  name: "Resend",
  category: "email-transactional",
  status: "draft",
  bucket: "personal-data",
  owner: { company: "Resend, Inc.", hq_country: "US", parent_company: null },
  jurisdiction: { third_country: true, cloud_act_exposure: "yes" },
  data: { may_process_personal_data: true, locations: ["US"] },
  detect: { npm: ["resend"], env: ["RESEND_API_KEY"] },
  alternatives: ["lettermint"],
  migration_effort: "low",
  confidence: "inferred",
  sources: [{ url: "https://example.com/a", claim: "claim" }],
  last_verified_at: "2026-10-30",
  ...overrides,
});

const alternative = (overrides: Record<string, unknown> = {}) => ({
  id: "lettermint",
  name: "Lettermint",
  category: "email-transactional",
  owner: { company: "[TO VERIFY]", hq_country: "NL" },
  url: "https://lettermint.co",
  open_source: false,
  self_hostable: false,
  partner: { status: "none", referral_url: null, disclosure: null },
  sources: [{ url: "https://lettermint.co", claim: "claim" }],
  last_verified_at: "2026-10-31",
  ...overrides,
});

describe("buildCatalog", () => {
  it("builds a catalog whose version is the newest verification date", () => {
    const catalog = buildCatalog(
      [{ file: "resend.yaml", data: service() }],
      [{ file: "lettermint.yaml", data: alternative() }],
    );
    expect(catalog.services.map((s) => s.id)).toEqual(["resend"]);
    expect(catalog.alternatives.map((a) => a.id)).toEqual(["lettermint"]);
    expect(catalog.version).toBe("2026-10-31");
  });

  it("uses a placeholder version for an empty catalog", () => {
    expect(buildCatalog([], []).version).toBe(EMPTY_CATALOG_VERSION);
  });

  it("reports every problem at once", () => {
    try {
      buildCatalog(
        [
          { file: "resend.yaml", data: service({ alternatives: ["missing-alt"] }) },
          { file: "broken.yaml", data: service({ id: "broken", sources: [] }) },
        ],
        [],
      );
      expect.unreachable("buildCatalog should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      const problems = (error as CatalogError).problems.join("\n");
      expect(problems).toContain("missing-alt");
      expect(problems).toContain("broken.yaml");
    }
  });

  it("rejects an id that does not match its file name", () => {
    expect(() =>
      buildCatalog(
        [{ file: "sendgrid.yaml", data: service({ alternatives: [] }) }],
        [],
      ),
    ).toThrow(/must match the file name/);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      buildCatalog(
        [{ file: "resend.yaml", data: service({ alternatives: [] }) }],
        [{ file: "resend.yaml", data: alternative({ id: "resend" }) }],
      ),
    ).toThrow(/duplicate id/);
  });
});

describe("readYamlDocuments", () => {
  it("returns [] for a missing folder and reads only YAML files, sorted", () => {
    const dir = mkdtempSync(join(tmpdir(), "euscan-rules-"));
    expect(readYamlDocuments(join(dir, "nope"))).toEqual([]);

    writeFileSync(join(dir, "b.yaml"), "id: b\n");
    writeFileSync(join(dir, "a.yml"), "id: a\n");
    writeFileSync(join(dir, "notes.md"), "# ignored\n");
    expect(readYamlDocuments(dir).map((d) => d.file)).toEqual(["a.yml", "b.yaml"]);
  });
});

describe("loadCatalog", () => {
  it("loads a catalog folder from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "euscan-catalog-"));
    mkdirSync(join(root, "services"));
    mkdirSync(join(root, "alternatives"));
    writeFileSync(
      join(root, "alternatives", "lettermint.yaml"),
      [
        "id: lettermint",
        "name: Lettermint",
        "category: email-transactional",
        "owner: { company: Example, hq_country: NL }",
        "url: https://lettermint.co",
        "open_source: false",
        "self_hostable: false",
        "partner: { status: none, referral_url: null, disclosure: null }",
        "sources: [{ url: 'https://lettermint.co', claim: claim }]",
        "last_verified_at: 2026-10-31",
      ].join("\n"),
    );
    const catalog = loadCatalog(root);
    expect(catalog.alternatives[0]?.id).toBe("lettermint");
    expect(catalog.version).toBe("2026-10-31");
  });

  it("the catalog shipped in this repo is valid", () => {
    const catalog = loadCatalog();
    expect(catalog.services.length).toBeGreaterThan(0);
    expect(catalog.services.find((s) => s.id === "resend")?.alternatives).toContain("lettermint");
  });
});
