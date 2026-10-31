import { ServiceRuleSchema, type Catalog, type ServiceRule } from "@euscan/shared";

export const service = (overrides: Record<string, unknown> = {}): ServiceRule =>
  ServiceRuleSchema.parse({
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
    ...overrides,
  });

export const catalogOf = (...services: ServiceRule[]): Catalog => ({
  services,
  alternatives: [],
  version: "2026-10-31",
});

export const packageJson = (deps: Record<string, string>, devDeps: Record<string, string> = {}): string =>
  `${JSON.stringify({ name: "app", dependencies: deps, devDependencies: devDeps }, null, 2)}\n`;
