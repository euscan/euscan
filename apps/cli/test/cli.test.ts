import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AlternativeSchema, ScanResultSchema, ServiceRuleSchema, type Catalog } from "@euscan/shared";
import { parseArgs, UsageError } from "../src/args.js";
import { collectFiles, DEFAULT_LIMITS } from "../src/collect.js";
import { alternativeLabel, formatReport } from "../src/format.js";
import { EXIT, run } from "../src/main.js";

const resend = ServiceRuleSchema.parse({
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
  sources: [{ url: "https://example.com/source", claim: "claim" }],
  last_verified_at: "2026-10-31",
});

const catalog: Catalog = {
  services: [resend],
  alternatives: [
    {
      id: "lettermint",
      name: "Lettermint",
      category: "email-transactional",
      owner: { company: "Example", hq_country: "NL" },
      url: "https://lettermint.co",
      open_source: false,
      self_hostable: false,
      feature_gaps: [],
      hosting: [],
      notes: "",
      partner: { status: "none", referral_url: null, disclosure: null },
      sources: [{ url: "https://lettermint.co", claim: "claim" }],
      last_verified_at: "2026-10-31",
    },
  ],
  version: "2026-10-31",
};

/** Builds a small project on disk, including files the scanner must ignore. */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "euscan-cli-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { resend: "^4.0.0" }, devDependencies: { vitest: "^3.0.0" } }, null, 2),
  );
  writeFileSync(join(root, ".env.example"), "RESEND_API_KEY=\n");
  writeFileSync(join(root, ".env"), "RESEND_API_KEY=real-secret\n");
  mkdirSync(join(root, "node_modules", "resend"), { recursive: true });
  writeFileSync(join(root, "node_modules", "resend", "package.json"), JSON.stringify({ name: "resend" }));
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web", dependencies: {} }));
  return root;
}

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) }, out, err };
};

describe("parseArgs", () => {
  it("defaults to scanning the current folder", () => {
    expect(parseArgs(["scan"])).toEqual({ command: "scan", path: ".", json: false, failOn: null });
  });

  it("reads the path, --json and --fail-on in both forms", () => {
    expect(parseArgs(["scan", "repo", "--json", "--fail-on", "personal-data"])).toEqual({
      command: "scan",
      path: "repo",
      json: true,
      failOn: "personal-data",
    });
    expect(parseArgs(["scan", "--fail-on=noise"])).toMatchObject({ failOn: "noise" });
  });

  it("shows help and version", () => {
    expect(parseArgs([])).toEqual({ command: "help" });
    expect(parseArgs(["scan", "--help"])).toEqual({ command: "help" });
    expect(parseArgs(["--version"])).toEqual({ command: "version" });
  });

  it("rejects unknown commands, options, buckets and extra paths", () => {
    expect(() => parseArgs(["audit"])).toThrow(UsageError);
    expect(() => parseArgs(["scan", "--fast"])).toThrow(UsageError);
    expect(() => parseArgs(["scan", "--fail-on", "everything"])).toThrow(UsageError);
    expect(() => parseArgs(["scan", "a", "b"])).toThrow(UsageError);
  });
});

describe("collectFiles", () => {
  it("collects package.json files and env templates, skipping node_modules and real .env files", () => {
    const paths = collectFiles(makeProject()).map((f) => f.path);
    expect(paths).toEqual([".env.example", "apps/web/package.json", "package.json"]);
  });

  it("refuses a file path", () => {
    const root = makeProject();
    expect(() => collectFiles(join(root, "package.json"))).toThrow(/is a file/);
  });

  it("never follows symbolic links, to files, folders or loops", () => {
    const outside = mkdtempSync(join(tmpdir(), "euscan-outside-"));
    writeFileSync(join(outside, "package.json"), JSON.stringify({ name: "secret", dependencies: { resend: "4" } }));
    const root = mkdtempSync(join(tmpdir(), "euscan-links-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app" }));
    symlinkSync(outside, join(root, "linked-dir"), "dir");
    symlinkSync(join(outside, "package.json"), join(root, "linked.json"));
    mkdirSync(join(root, "sub"));
    symlinkSync(root, join(root, "sub", "loop"), "dir");
    expect(collectFiles(root).map((f) => f.path)).toEqual(["package.json"]);
  });

  it("skips folders deeper than maxDepth", () => {
    const root = mkdtempSync(join(tmpdir(), "euscan-deep-"));
    mkdirSync(join(root, "a", "b", "c"), { recursive: true });
    writeFileSync(join(root, "a", "package.json"), "{}");
    writeFileSync(join(root, "a", "b", "c", "package.json"), "{}");
    const paths = collectFiles(root, { ...DEFAULT_LIMITS, maxDepth: 2 }).map((f) => f.path);
    expect(paths).toEqual(["a/package.json"]);
  });

  it("stops with a clear error on too many entries or too many bytes", () => {
    const root = makeProject();
    expect(() => collectFiles(root, { ...DEFAULT_LIMITS, maxEntries: 2 })).toThrow(/more than 2 files and folders/);
    expect(() => collectFiles(root, { ...DEFAULT_LIMITS, maxTotalBytes: 10 })).toThrow(/exceed 10 bytes/);
  });
});

describe("run", () => {
  it("prints a readable report with evidence, alternatives and the disclaimer", () => {
    const { io, out } = capture();
    const code = run(["scan", makeProject()], io, { catalog });
    const text = out.join("");
    expect(code).toBe(EXIT.ok);
    expect(text).toContain("Sovereignty grade: B");
    expect(text).toContain("package.json:4");
    expect(text).toContain(".env.example:1");
    expect(text).toContain("EU alternatives: Lettermint");
    expect(text).toContain("Not legal advice or a certification.");
    expect(text).not.toContain("real-secret");
  });

  it("prints valid JSON with --json", () => {
    const { io, out } = capture();
    run(["scan", makeProject(), "--json"], io, { catalog });
    const parsed = ScanResultSchema.parse(JSON.parse(out.join("")));
    expect(parsed.grade).toBe("B");
    expect(parsed.filesScanned).toBe(3);
  });

  it("exits with 1 only when --fail-on finds that bucket", () => {
    const project = makeProject();
    expect(run(["scan", project, "--fail-on", "personal-data"], capture().io, { catalog })).toBe(EXIT.failOn);
    expect(run(["scan", project, "--fail-on", "known-exposure"], capture().io, { catalog })).toBe(EXIT.ok);
  });

  it("exits with 2 and shows usage on a bad call", () => {
    const { io, err } = capture();
    expect(run(["scan", "--nope"], io, { catalog })).toBe(EXIT.error);
    expect(err.join("")).toContain("Usage: euscan scan");
  });

  it("exits with 2 when the folder does not exist", () => {
    const { io, err } = capture();
    expect(run(["scan", join(tmpdir(), "euscan-does-not-exist-42")], io, { catalog })).toBe(EXIT.error);
    expect(err.join("")).toContain("Cannot read");
  });

  it("lists plugin dependencies under INTEGRATIONS without counting them", () => {
    const root = mkdtempSync(join(tmpdir(), "euscan-cli-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app", dependencies: {} }));
    mkdirSync(join(root, "plugins", "mail"), { recursive: true });
    writeFileSync(join(root, "plugins", "mail", "package.json"), JSON.stringify({ name: "mail", dependencies: { resend: "4" } }));
    const { io, out } = capture();
    expect(run(["scan", root], io, { catalog })).toBe(EXIT.ok);
    const text = out.join("");
    expect(text).toContain("Sovereignty grade: A");
    expect(text).toContain("INTEGRATIONS:");
    expect(text).toContain("plugins/mail/package.json");
    expect(text).toContain("Integrations offered to users: 1 service");
  });

  it("says 'not assessed' for a project without any package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "euscan-cli-"));
    writeFileSync(join(root, "requirements.txt"), "django==5.0\n");
    const { io, out } = capture();
    expect(run(["scan", root], io, { catalog })).toBe(EXIT.ok);
    expect(out.join("")).toContain("Sovereignty grade: not assessed");
  });

  it("puts 'not-assessed' in JSON output for a project without any package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "euscan-cli-"));
    writeFileSync(join(root, "requirements.txt"), "django==5.0\n");
    const { io, out } = capture();
    expect(run(["scan", root, "--json"], io, { catalog })).toBe(EXIT.ok);
    const parsed = ScanResultSchema.parse(JSON.parse(out.join("")));
    expect(parsed.grade).toBe("not-assessed");
    expect(parsed.coverage).toEqual({ manifests: 0, envTemplates: 0 });
  });

  it("works with the catalog shipped in the repo", () => {
    const { io, out } = capture();
    expect(run(["scan", makeProject()], io)).toBe(EXIT.ok);
    expect(out.join("")).toContain("Resend");
  });
});

describe("formatReport", () => {
  it("says 'none found' for empty buckets", () => {
    const empty = ScanResultSchema.parse({
      grade: "A",
      findings: [],
      summary: { personalDataServices: 0, thirdCountryPersonalDataServices: 0, knownExposureServices: 0, noiseServices: 0 },
      subScores: { jurisdiction: 0, dataControl: 0, operationalDependency: 0 },
      filesScanned: 1,
      catalogVersion: "2026-10-31",
      disclaimer: "Dependency inventory and risk assessment. Not legal advice or a certification.",
    });
    const text = formatReport(empty, catalog, ".");
    expect(text).toContain("Sovereignty grade: A");
    expect(text.match(/none found/g)).toHaveLength(3);
  });

  const emptyResult = () =>
    ScanResultSchema.parse({
      grade: "A",
      findings: [],
      summary: { personalDataServices: 0, thirdCountryPersonalDataServices: 0, knownExposureServices: 0, noiseServices: 0 },
      subScores: { jurisdiction: 0, dataControl: 0, operationalDependency: 0 },
      filesScanned: 0,
      catalogVersion: "2026-10-31",
      disclaimer: "Dependency inventory and risk assessment. Not legal advice or a certification.",
    });

  it("reports 'not assessed' instead of grade A when no package.json was found", () => {
    const text = formatReport(emptyResult(), catalog, ".", { manifests: 0, envTemplates: 0 });
    expect(text).toContain("Sovereignty grade: not assessed");
    expect(text).not.toContain("Sovereignty grade: A");
    expect(text).toContain("Coverage: 0 package.json files, 0 env templates.");
  });

  it("reads coverage from the result when none is passed", () => {
    const result = { ...emptyResult(), grade: "not-assessed" as const, coverage: { manifests: 0, envTemplates: 2 } };
    const text = formatReport(result, catalog, ".");
    expect(text).toContain("Sovereignty grade: not assessed");
    expect(text).toContain("Coverage: 0 package.json files, 2 env templates.");
  });

  it("keeps the grade and shows coverage when manifests were read", () => {
    const text = formatReport(emptyResult(), catalog, ".", { manifests: 3, envTemplates: 1 });
    expect(text).toContain("Sovereignty grade: A");
    expect(text).toContain("Coverage: 3 package.json files, 1 env template.");
  });
});

describe("alternativeLabel", () => {
  const base = {
    id: "hanko",
    name: "Hanko",
    category: "auth",
    owner: { company: "Hanko GmbH", hq_country: "DE" },
    url: "https://www.hanko.io",
    open_source: true,
    self_hostable: true,
    partner: { status: "none", referral_url: null, disclosure: null },
    sources: [{ url: "https://www.hanko.io", claim: "claim" }],
    last_verified_at: "2026-10-31",
  };

  it("shows the plain name for EU-hosted or unknown hosting", () => {
    expect(alternativeLabel(AlternativeSchema.parse(base))).toBe("Hanko");
    const eu = { ...base, hosting: [{ provider: "Hetzner Online GmbH", provider_country: "DE", locations: ["DE"] }] };
    expect(alternativeLabel(AlternativeSchema.parse(eu))).toBe("Hanko");
  });

  it("flags a non-EU hosting provider", () => {
    const aws = { ...base, hosting: [{ provider: "Amazon Web Services", provider_country: "US", locations: ["DE"] }] };
    expect(alternativeLabel(AlternativeSchema.parse(aws))).toBe("Hanko (runs on Amazon Web Services, US)");
  });

  it("ignores optional non-EU regions", () => {
    const optional = { ...base, hosting: [{ provider: "Hetzner US", provider_country: "US", optional: true }] };
    expect(alternativeLabel(AlternativeSchema.parse(optional))).toBe("Hanko");
  });
});
