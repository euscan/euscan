import { describe, expect, it } from "vitest";
import { gradeFor, scan } from "@euscan/core";
import { catalogOf, packageJson, service } from "./helpers.js";

describe("gradeFor", () => {
  it("follows the draft thresholds", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(gradeFor)).toEqual(["A", "B", "C", "C", "D", "D", "E", "E"]);
  });
});

describe("scan", () => {
  const resend = service();
  const stripe = service({
    id: "stripe",
    name: "Stripe",
    category: "payments",
    bucket: "known-exposure",
    detect: { npm: ["stripe"], env: ["STRIPE_SECRET_KEY"] },
    alternatives: [],
  });
  const plausible = service({
    id: "eu-analytics",
    name: "EU Analytics",
    category: "analytics",
    owner: { company: "Example GmbH", hq_country: "DE", parent_company: null },
    jurisdiction: { third_country: false, cloud_act_exposure: "no" },
    detect: { npm: ["eu-analytics"] },
    alternatives: [],
  });
  const catalog = catalogOf(resend, stripe, plausible);

  it("reports dependencies in integration folders as integrations without grading them", () => {
    const files = [
      { path: "package.json", content: packageJson({ next: "14" }) },
      { path: "packages/providers/email-resend/package.json", content: packageJson({ resend: "4" }) },
    ];
    const result = scan(files, catalog);
    expect(result.grade).toBe("A");
    expect(result.summary.thirdCountryPersonalDataServices).toBe(0);
    expect(result.summary.integrationServices).toBe(1);
    expect(result.findings.map((f) => [f.serviceId, f.dependencyKind])).toEqual([["resend", "integration"]]);
  });

  it("still grades a service the project uses itself, even if a plugin also uses it", () => {
    const files = [
      { path: "package.json", content: packageJson({ resend: "4" }) },
      { path: "plugins/mailer/package.json", content: packageJson({ resend: "4" }) },
    ];
    const result = scan(files, catalog);
    expect(result.grade).toBe("B");
    expect(result.summary.integrationServices).toBe(0);
  });

  it("keeps devDependencies in integration folders as dev noise", () => {
    const files = [{ path: "packages/plugins/x/package.json", content: packageJson({}, { resend: "4" }) }];
    const result = scan(files, catalog);
    expect(result.findings.map((f) => [f.dependencyKind, f.bucket])).toEqual([["dev", "noise"]]);
  });

  it("returns grade A and no findings for a clean repo", () => {
    const result = scan([{ path: "package.json", content: packageJson({ next: "14" }) }], catalog);
    expect(result.grade).toBe("A");
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBe(1);
  });

  it("sorts findings into buckets and grades only third-country personal-data services", () => {
    const files = [
      { path: "package.json", content: packageJson({ resend: "4", stripe: "16", "eu-analytics": "1" }) },
      { path: ".env.example", content: "RESEND_API_KEY=\nSTRIPE_SECRET_KEY=\n" },
    ];
    const result = scan(files, catalog);

    expect(result.grade).toBe("B");
    expect(result.summary).toEqual({
      personalDataServices: 2,
      thirdCountryPersonalDataServices: 1,
      knownExposureServices: 1,
      noiseServices: 0,
      integrationServices: 0,
    });
    expect(result.subScores).toEqual({ jurisdiction: 2, dataControl: 1, operationalDependency: 1 });
    expect(result.findings.map((f) => [f.bucket, f.serviceId, f.evidence.file])).toEqual([
      ["personal-data", "eu-analytics", "package.json"],
      ["personal-data", "resend", ".env.example"],
      ["personal-data", "resend", "package.json"],
      ["known-exposure", "stripe", ".env.example"],
      ["known-exposure", "stripe", "package.json"],
    ]);
  });

  it("downgrades devDependencies to noise", () => {
    const result = scan([{ path: "package.json", content: packageJson({}, { resend: "4" }) }], catalog);
    expect(result.findings[0]?.bucket).toBe("noise");
    expect(result.grade).toBe("A");
    expect(result.summary.noiseServices).toBe(1);
  });

  it("counts a service once, by its most severe bucket", () => {
    const content = packageJson({ resend: "4" }, { resend: "4" });
    const result = scan([{ path: "package.json", content }], catalog);
    expect(result.findings).toHaveLength(2);
    expect(result.summary.personalDataServices).toBe(1);
    expect(result.summary.noiseServices).toBe(0);
  });

  it("sets confidence from the catalog entry status", () => {
    const content = packageJson({ resend: "4" });
    const draft = scan([{ path: "package.json", content }], catalogOf(resend));
    expect(draft.findings[0]?.confidence).toBe("inferred");

    const verified = scan([{ path: "package.json", content }], catalogOf(service({ status: "verified" })));
    expect(verified.findings[0]?.confidence).toBe("confirmed");

    const unknown = scan([{ path: "package.json", content }], catalogOf(service({ confidence: "unknown" })));
    expect(unknown.findings[0]?.confidence).toBe("unknown");
  });

  it("attaches evidence with the rule version", () => {
    const result = scan([{ path: "apps/api/package.json", content: packageJson({ resend: "4" }) }], catalog);
    expect(result.findings[0]?.evidence).toEqual({
      file: "apps/api/package.json",
      line: 4,
      match: "resend",
      detector: "npm",
      ruleVersion: "2026-10-31",
    });
  });

  it("removes duplicate files and is deterministic", () => {
    const file = { path: "package.json", content: packageJson({ resend: "4", stripe: "16" }) };
    const first = scan([file, file], catalog);
    const second = scan([file], catalog);
    expect(first.findings).toEqual(second.findings);
    expect(JSON.stringify(scan([file], catalog))).toBe(JSON.stringify(second));
  });

  it("always carries the disclaimer and catalog version", () => {
    const result = scan([], catalog);
    expect(result.disclaimer).toContain("Not legal advice");
    expect(result.catalogVersion).toBe("2026-10-31");
  });

  it("returns 'not-assessed' when no package.json was read and nothing was found", () => {
    expect(scan([], catalog).grade).toBe("not-assessed");
    const envOnly = scan([{ path: ".env.example", content: "PORT=3000\n" }], catalog);
    expect(envOnly.grade).toBe("not-assessed");
    expect(envOnly.coverage).toEqual({ manifests: 0, envTemplates: 1 });
  });

  it("still grades a project without package.json when an env template has findings", () => {
    const result = scan([{ path: ".env.example", content: "RESEND_API_KEY=\n" }], catalog);
    expect(result.grade).toBe("B");
  });

  it("reports coverage for manifests and env templates", () => {
    const files = [
      { path: "package.json", content: packageJson({ next: "14" }) },
      { path: "apps/web/package.json", content: packageJson({ next: "14" }) },
      { path: ".env.example", content: "PORT=3000\n" },
    ];
    const result = scan(files, catalog);
    expect(result.coverage).toEqual({ manifests: 2, envTemplates: 1 });
    expect(result.grade).toBe("A");
  });

  it("rejects malformed input", () => {
    expect(() => scan([{ path: "", content: "" }], catalog)).toThrow();
  });
});
