/**
 * Shared contracts for EUscan.
 *
 * Catalog files (YAML) use snake_case keys; they are validated with
 * `ServiceRuleSchema` and `AlternativeSchema`. Scan output uses camelCase
 * and is validated with `ScanResultSchema`.
 */
import { z } from "zod";

// ---------- enums ----------

export const BucketSchema = z.enum(["noise", "personal-data", "known-exposure"]);
export type Bucket = z.infer<typeof BucketSchema>;

export const ConfidenceSchema = z.enum(["confirmed", "inferred", "unknown"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const CloudActExposureSchema = z.enum(["yes", "partly", "no", "unknown"]);
export type CloudActExposure = z.infer<typeof CloudActExposureSchema>;

export const MigrationEffortSchema = z.enum(["low", "medium", "high"]);
export type MigrationEffort = z.infer<typeof MigrationEffortSchema>;

export const EntryStatusSchema = z.enum(["draft", "verified"]);
export type EntryStatus = z.infer<typeof EntryStatusSchema>;

export const PartnerStatusSchema = z.enum(["none", "affiliate", "direct-deal", "sponsored"]);
export type PartnerStatus = z.infer<typeof PartnerStatusSchema>;

export const CategorySchema = z.enum([
  "cloud-infra",
  "hosting",
  "database",
  "storage",
  "auth",
  "email-transactional",
  "email-marketing",
  "analytics",
  "error-tracking",
  "observability",
  "payments",
  "ai-llm",
  "sms-voice",
  "search",
  "cdn",
  "feature-flags",
  "support-chat",
  "dev-tooling",
]);
export type Category = z.infer<typeof CategorySchema>;

export const DetectorSchema = z.enum(["npm", "env"]);
export type Detector = z.infer<typeof DetectorSchema>;

/**
 * - runtime: a production dependency of the project itself
 * - dev: devDependency, never shipped
 * - config: referenced in an env template
 * - integration: declared inside an integration, plugin or provider folder, i.e. a connector the
 *   project offers to its own users rather than a service it uses itself. Shown, but not graded.
 */
export const DependencyKindSchema = z.enum(["runtime", "dev", "config", "integration"]);
export type DependencyKind = z.infer<typeof DependencyKindSchema>;

export const GradeSchema = z.enum(["A", "B", "C", "D", "E"]);
export type Grade = z.infer<typeof GradeSchema>;

/**
 * Grade carried by a scan result. "not-assessed" means the scanner found no file it can read
 * (no package.json and no findings), so a letter grade would be misleading.
 */
export const ResultGradeSchema = z.union([GradeSchema, z.literal("not-assessed")]);
export type ResultGrade = z.infer<typeof ResultGradeSchema>;

/** What the scanner could read. */
export const CoverageSchema = z.object({
  /** Number of package.json files read. */
  manifests: z.number().int().min(0),
  /** Number of env templates (.env.example and similar) read. */
  envTemplates: z.number().int().min(0),
});
export type Coverage = z.infer<typeof CoverageSchema>;

// ---------- small building blocks ----------

/** Lowercase id that also names the YAML file: `resend`, `google-analytics`. */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "ids are lowercase words joined by dashes");

/** ISO 3166-1 alpha-2 country code, e.g. `US`, `NL`. */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "use a 2-letter ISO country code");

/** A calendar date. YAML may give a string or a Date; both become `YYYY-MM-DD`. */
export const IsoDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD"), z.date()])
  .transform((value) => (typeof value === "string" ? value : value.toISOString().slice(0, 10)));

export const SourceSchema = z.object({
  url: z.string().url(),
  claim: z.string().min(1),
});
export type Source = z.infer<typeof SourceSchema>;

const nameList = z.array(z.string().min(1)).default([]);

// ---------- catalog: services ----------

export const ServiceRuleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: CategorySchema,
  status: EntryStatusSchema,
  bucket: BucketSchema,
  owner: z.object({
    company: z.string().min(1),
    hq_country: CountryCodeSchema,
    parent_company: z.string().min(1).nullable().default(null),
  }),
  jurisdiction: z.object({
    third_country: z.boolean(),
    cloud_act_exposure: CloudActExposureSchema,
  }),
  data: z.object({
    may_process_personal_data: z.boolean(),
    locations: z.array(z.string().min(1)).min(1),
    notes: z.string().default(""),
  }),
  detect: z.object({
    npm: nameList,
    pypi: nameList,
    env: nameList,
    domains: nameList,
    docker_images: nameList,
    terraform_providers: nameList,
    github_actions: nameList,
  }),
  alternatives: z.array(IdSchema).default([]),
  migration_effort: MigrationEffortSchema,
  confidence: ConfidenceSchema,
  sources: z.array(SourceSchema).min(1, "every entry needs at least one source"),
  last_verified_at: IsoDateSchema,
});
export type ServiceRule = z.infer<typeof ServiceRuleSchema>;

// ---------- catalog: EU alternatives ----------

/**
 * Who actually runs the infrastructure behind a service. An EU company can still
 * host on a non-EU provider (for example a US hyperscaler's Frankfurt region).
 */
export const HostingSchema = z.object({
  /** The infrastructure company, e.g. "Amazon Web Services" or "Hetzner Online GmbH". */
  provider: z.string().min(1),
  /** Where that provider is headquartered (decides its jurisdiction). */
  provider_country: CountryCodeSchema,
  /** Where the data physically sits, e.g. ["DE", "FI"]. */
  locations: z.array(CountryCodeSchema).default([]),
  /** True when this hosting is optional (another region the customer can choose). */
  optional: z.boolean().default(false),
});
export type Hosting = z.infer<typeof HostingSchema>;

/** EU/EEA member states, used to flag non-EU hosting providers. */
export const EU_EEA_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);

/** True when any default (non-optional) hosting provider is headquartered outside the EU/EEA. */
export function hasNonEuHosting(hosting: readonly Hosting[]): boolean {
  return hosting.some((h) => !h.optional && !EU_EEA_COUNTRIES.has(h.provider_country));
}

export const AlternativeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: CategorySchema,
  owner: z.object({
    company: z.string().min(1),
    hq_country: CountryCodeSchema,
  }),
  url: z.string().url(),
  open_source: z.boolean(),
  self_hostable: z.boolean(),
  feature_gaps: z.array(z.string().min(1)).default([]),
  hosting: z.array(HostingSchema).default([]),
  notes: z.string().default(""),
  partner: z
    .object({
      status: PartnerStatusSchema,
      referral_url: z.string().url().nullable(),
      disclosure: z.string().min(1).nullable(),
    })
    .refine((p) => p.status === "none" || (p.referral_url !== null && p.disclosure !== null), {
      message: "a partner link always needs a referral_url and a visible disclosure",
    }),
  sources: z.array(SourceSchema).min(1, "every entry needs at least one source"),
  last_verified_at: IsoDateSchema,
});
export type Alternative = z.infer<typeof AlternativeSchema>;

export interface Catalog {
  services: ServiceRule[];
  alternatives: Alternative[];
  /** The newest `last_verified_at` in the catalog; used as the rule version. */
  version: string;
}

// ---------- scan input and output ----------

export const ScanFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type ScanFile = z.infer<typeof ScanFileSchema>;

export const EvidenceSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  match: z.string().min(1),
  detector: DetectorSchema,
  ruleVersion: z.string().min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FindingSchema = z.object({
  serviceId: IdSchema,
  serviceName: z.string().min(1),
  category: CategorySchema,
  bucket: BucketSchema,
  confidence: ConfidenceSchema,
  dependencyKind: DependencyKindSchema,
  thirdCountry: z.boolean(),
  evidence: EvidenceSchema,
  alternatives: z.array(IdSchema),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ScanResultSchema = z.object({
  grade: ResultGradeSchema,
  findings: z.array(FindingSchema),
  summary: z.object({
    personalDataServices: z.number().int().min(0),
    thirdCountryPersonalDataServices: z.number().int().min(0),
    knownExposureServices: z.number().int().min(0),
    noiseServices: z.number().int().min(0),
    /** Services found only in integration folders; they do not affect the grade. */
    integrationServices: z.number().int().min(0).default(0),
  }),
  subScores: z.object({
    jurisdiction: z.number().int().min(0),
    dataControl: z.number().int().min(0),
    operationalDependency: z.number().int().min(0),
  }),
  filesScanned: z.number().int().min(0),
  /** Set by scan(); optional so results written before this field existed still parse. */
  coverage: CoverageSchema.optional(),
  catalogVersion: z.string().min(1),
  disclaimer: z.string().min(1),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const DISCLAIMER =
  "Dependency inventory and risk assessment. Not legal advice or a certification.";
