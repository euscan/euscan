import { describe, expect, it } from "vitest";
import {
  AlternativeSchema,
  EU_EEA_COUNTRIES,
  hasNonEuHosting,
  HostingSchema,
  DISCLAIMER,
  FindingSchema,
  IsoDateSchema,
  ResultGradeSchema,
  ScanResultSchema,
  ServiceRuleSchema,
} from "@euscan/shared";

const validService = {
  id: "resend",
  name: "Resend",
  category: "email-transactional",
  status: "draft",
  bucket: "personal-data",
  owner: { company: "Resend, Inc.", hq_country: "US", parent_company: null },
  jurisdiction: { third_country: true, cloud_act_exposure: "yes" },
  data: { may_process_personal_data: true, locations: ["US"], notes: "" },
  detect: { npm: ["resend"], env: ["RESEND_API_KEY"] },
  alternatives: ["lettermint"],
  migration_effort: "low",
  confidence: "inferred",
  sources: [{ url: "https://example.com/source", claim: "Data location" }],
  last_verified_at: "2026-10-31",
};

const validAlternative = {
  id: "lettermint",
  name: "Lettermint",
  category: "email-transactional",
  owner: { company: "[TO VERIFY]", hq_country: "NL" },
  url: "https://lettermint.co",
  open_source: false,
  self_hostable: false,
  partner: { status: "none", referral_url: null, disclosure: null },
  sources: [{ url: "https://lettermint.co", claim: "Hosting location" }],
  last_verified_at: "2026-10-31",
};

describe("ServiceRuleSchema", () => {
  it("accepts a valid entry and fills defaults for missing detector lists", () => {
    const parsed = ServiceRuleSchema.parse(validService);
    expect(parsed.detect.pypi).toEqual([]);
    expect(parsed.detect.github_actions).toEqual([]);
  });

  it("rejects an entry without sources", () => {
    const result = ServiceRuleSchema.safeParse({ ...validService, sources: [] });
    expect(result.success).toBe(false);
  });

  it("rejects ids that are not lowercase-dashed", () => {
    expect(ServiceRuleSchema.safeParse({ ...validService, id: "Resend_Email" }).success).toBe(false);
  });

  it("rejects country codes that are not 2 uppercase letters", () => {
    const owner = { ...validService.owner, hq_country: "usa" };
    expect(ServiceRuleSchema.safeParse({ ...validService, owner }).success).toBe(false);
  });

  it("rejects unknown buckets and categories", () => {
    expect(ServiceRuleSchema.safeParse({ ...validService, bucket: "danger" }).success).toBe(false);
    expect(ServiceRuleSchema.safeParse({ ...validService, category: "crypto" }).success).toBe(false);
  });
});

describe("AlternativeSchema", () => {
  it("accepts a valid entry without partner data", () => {
    expect(AlternativeSchema.parse(validAlternative).partner.status).toBe("none");
  });

  it("requires a referral url and a disclosure for any partner link", () => {
    const partner = { status: "affiliate", referral_url: "https://example.com/ref", disclosure: null };
    expect(AlternativeSchema.safeParse({ ...validAlternative, partner }).success).toBe(false);

    const disclosed = { ...partner, disclosure: "Partner: we may earn a commission" };
    expect(AlternativeSchema.safeParse({ ...validAlternative, partner: disclosed }).success).toBe(true);
  });
});

describe("IsoDateSchema", () => {
  it("keeps YYYY-MM-DD strings", () => {
    expect(IsoDateSchema.parse("2026-10-31")).toBe("2026-10-31");
  });

  it("turns Date objects into YYYY-MM-DD", () => {
    expect(IsoDateSchema.parse(new Date("2026-10-31T00:00:00Z"))).toBe("2026-10-31");
  });

  it("rejects other date formats", () => {
    expect(IsoDateSchema.safeParse("31.10.2026").success).toBe(false);
  });
});

describe("FindingSchema and ScanResultSchema", () => {
  const finding = {
    serviceId: "resend",
    serviceName: "Resend",
    category: "email-transactional",
    bucket: "personal-data",
    confidence: "inferred",
    dependencyKind: "runtime",
    thirdCountry: true,
    evidence: {
      file: "package.json",
      line: 12,
      match: "resend",
      detector: "npm",
      ruleVersion: "2026-10-31",
    },
    alternatives: ["lettermint"],
  };

  it("requires evidence with a 1-based line number", () => {
    expect(FindingSchema.safeParse(finding).success).toBe(true);
    const badLine = { ...finding, evidence: { ...finding.evidence, line: 0 } };
    expect(FindingSchema.safeParse(badLine).success).toBe(false);
  });

  it("accepts a complete scan result carrying the disclaimer", () => {
    const result = ScanResultSchema.safeParse({
      grade: "B",
      findings: [finding],
      summary: {
        personalDataServices: 1,
        thirdCountryPersonalDataServices: 1,
        knownExposureServices: 0,
        noiseServices: 0,
      },
      subScores: { jurisdiction: 1, dataControl: 1, operationalDependency: 0 },
      filesScanned: 2,
      catalogVersion: "2026-10-31",
      disclaimer: DISCLAIMER,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the integration dependency kind and defaults integrationServices to 0", () => {
    expect(FindingSchema.safeParse({ ...finding, dependencyKind: "integration" }).success).toBe(true);
    expect(FindingSchema.safeParse({ ...finding, dependencyKind: "plugin" }).success).toBe(false);
    const parsed = ScanResultSchema.parse({
      grade: "A",
      findings: [],
      summary: { personalDataServices: 0, thirdCountryPersonalDataServices: 0, knownExposureServices: 0, noiseServices: 0 },
      subScores: { jurisdiction: 0, dataControl: 0, operationalDependency: 0 },
      filesScanned: 0,
      catalogVersion: "2026-10-31",
      disclaimer: DISCLAIMER,
    });
    expect(parsed.summary.integrationServices).toBe(0);
  });

  it("accepts 'not-assessed' as a result grade and an optional coverage object", () => {
    expect(ResultGradeSchema.safeParse("not-assessed").success).toBe(true);
    expect(ResultGradeSchema.safeParse("F").success).toBe(false);
    const base = {
      grade: "not-assessed",
      findings: [],
      summary: { personalDataServices: 0, thirdCountryPersonalDataServices: 0, knownExposureServices: 0, noiseServices: 0 },
      subScores: { jurisdiction: 0, dataControl: 0, operationalDependency: 0 },
      filesScanned: 0,
      catalogVersion: "2026-10-31",
      disclaimer: DISCLAIMER,
    };
    expect(ScanResultSchema.safeParse(base).success).toBe(true);
    expect(ScanResultSchema.safeParse({ ...base, coverage: { manifests: 0, envTemplates: 0 } }).success).toBe(true);
    expect(ScanResultSchema.safeParse({ ...base, coverage: { manifests: -1, envTemplates: 0 } }).success).toBe(false);
  });

  it("never mentions compliance in the disclaimer as a promise", () => {
    expect(DISCLAIMER).toContain("Not legal advice or a certification");
  });
});

describe("hosting", () => {
  it("defaults to no hosting data and empty notes", () => {
    const parsed = AlternativeSchema.parse(validAlternative);
    expect(parsed.hosting).toEqual([]);
    expect(parsed.notes).toBe("");
  });

  it("validates hosting entries and fills defaults", () => {
    expect(HostingSchema.parse({ provider: "Hetzner Online GmbH", provider_country: "DE" })).toEqual({
      provider: "Hetzner Online GmbH",
      provider_country: "DE",
      locations: [],
      optional: false,
    });
    expect(HostingSchema.safeParse({ provider: "AWS", provider_country: "usa" }).success).toBe(false);
  });

  it("flags non-EU providers, but not optional regions", () => {
    const aws = HostingSchema.parse({ provider: "Amazon Web Services", provider_country: "US", locations: ["DE"] });
    const hetzner = HostingSchema.parse({ provider: "Hetzner Online GmbH", provider_country: "DE" });
    const optionalUs = HostingSchema.parse({ provider: "Hetzner US", provider_country: "US", optional: true });
    expect(hasNonEuHosting([hetzner])).toBe(false);
    expect(hasNonEuHosting([hetzner, aws])).toBe(true);
    expect(hasNonEuHosting([hetzner, optionalUs])).toBe(false);
    expect(hasNonEuHosting([])).toBe(false);
  });

  it("counts EEA members (Norway, Iceland, Liechtenstein) as EU/EEA", () => {
    for (const code of ["DE", "FR", "NO", "IS", "LI"]) expect(EU_EEA_COUNTRIES.has(code)).toBe(true);
    for (const code of ["US", "CH", "GB"]) expect(EU_EEA_COUNTRIES.has(code)).toBe(false);
  });
});
