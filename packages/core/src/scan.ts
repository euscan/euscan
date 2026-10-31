import {
  DISCLAIMER,
  ScanFileSchema,
  ScanResultSchema,
  type Bucket,
  type Catalog,
  type Confidence,
  type Finding,
  type Grade,
  type ScanFile,
  type ScanResult,
  type ServiceRule,
} from "@euscan/shared";
import { z } from "zod";
import { detectEnv, isEnvTemplate } from "./detectors/env.js";
import { detectNpm, isPackageJson } from "./detectors/npm.js";
import { isIntegrationPath } from "./integration.js";
import type { RawMatch } from "./match.js";

/** Locale-independent string order, so output is identical on every machine. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const BUCKET_ORDER: Record<Bucket, number> = { "personal-data": 0, "known-exposure": 1, noise: 2 };

/**
 * Grade from the number of distinct third-country services that may process personal data.
 * Draft thresholds from docs/specs/engine-v1.md: A=0, B=1, C=2–3, D=4–5, E=6+.
 */
export function gradeFor(thirdCountryPersonalDataServices: number): Grade {
  if (thirdCountryPersonalDataServices <= 0) return "A";
  if (thirdCountryPersonalDataServices === 1) return "B";
  if (thirdCountryPersonalDataServices <= 3) return "C";
  if (thirdCountryPersonalDataServices <= 5) return "D";
  return "E";
}

function confidenceFor(service: ServiceRule, match: RawMatch): Confidence {
  if (service.confidence === "unknown") return "unknown";
  if (service.status === "verified" && match.kind !== "dev") return "confirmed";
  return "inferred";
}

function toFinding(rawMatch: RawMatch, service: ServiceRule): Finding {
  // Dependencies declared inside plugin/provider/integration folders are connectors offered to users.
  const match: RawMatch =
    rawMatch.kind !== "dev" && isIntegrationPath(rawMatch.file) ? { ...rawMatch, kind: "integration" } : rawMatch;
  return {
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    // Dev-only dependencies never ship to production, so they never count as personal-data findings.
    bucket: match.kind === "dev" ? "noise" : service.bucket,
    confidence: confidenceFor(service, match),
    dependencyKind: match.kind,
    thirdCountry: service.jurisdiction.third_country,
    evidence: {
      file: match.file,
      line: match.line,
      match: match.match,
      detector: match.detector,
      ruleVersion: service.last_verified_at,
    },
    alternatives: [...service.alternatives],
  };
}

const compareFindings = (a: Finding, b: Finding): number =>
  BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
  byCodeUnit(a.serviceId, b.serviceId) ||
  byCodeUnit(a.evidence.file, b.evidence.file) ||
  a.evidence.line - b.evidence.line ||
  byCodeUnit(a.evidence.match, b.evidence.match) ||
  byCodeUnit(a.evidence.detector, b.evidence.detector);

/** The most severe bucket each service reached across its findings. */
function bucketPerService(findings: readonly Finding[]): Map<string, Finding> {
  const worst = new Map<string, Finding>();
  for (const finding of findings) {
    const current = worst.get(finding.serviceId);
    if (!current || BUCKET_ORDER[finding.bucket] < BUCKET_ORDER[current.bucket]) {
      worst.set(finding.serviceId, finding);
    }
  }
  return worst;
}

/**
 * Scans files against the catalog. Pure and deterministic: no disk or network access,
 * and the same input always gives the same output.
 */
export function scan(files: readonly ScanFile[], catalog: Catalog): ScanResult {
  const input = z.array(ScanFileSchema).parse(files);
  const byId = new Map(catalog.services.map((service) => [service.id, service]));

  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const file of input) {
    for (const match of [...detectNpm(file, catalog.services), ...detectEnv(file, catalog.services)]) {
      const service = byId.get(match.serviceId);
      if (!service) continue;
      const key = [match.serviceId, match.file, match.line, match.match, match.detector].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(toFinding(match, service));
    }
  }
  findings.sort(compareFindings);

  // Integration findings are reported but never graded.
  const graded = findings.filter((f) => f.dependencyKind !== "integration");
  const perService = [...bucketPerService(graded).values()];
  const gradedIds = new Set(perService.map((f) => f.serviceId));
  const integrationOnly = new Set(
    findings.filter((f) => f.dependencyKind === "integration" && !gradedIds.has(f.serviceId)).map((f) => f.serviceId),
  ).size;
  const personalData = perService.filter((f) => f.bucket === "personal-data");
  const thirdCountryPersonalData = personalData.filter((f) => f.thirdCountry).length;
  const knownExposure = perService.filter((f) => f.bucket === "known-exposure").length;
  const noise = perService.filter((f) => f.bucket === "noise").length;

  const coverage = {
    manifests: input.filter((f) => isPackageJson(f.path)).length,
    envTemplates: input.filter((f) => isEnvTemplate(f.path)).length,
  };
  // Without any package.json and without findings there is nothing to grade.
  const notAssessed = coverage.manifests === 0 && findings.length === 0;

  return ScanResultSchema.parse({
    grade: notAssessed ? "not-assessed" : gradeFor(thirdCountryPersonalData),
    findings,
    summary: {
      personalDataServices: personalData.length,
      thirdCountryPersonalDataServices: thirdCountryPersonalData,
      knownExposureServices: knownExposure,
      noiseServices: noise,
      integrationServices: integrationOnly,
    },
    subScores: {
      jurisdiction: perService.filter((f) => f.bucket !== "noise" && f.thirdCountry).length,
      dataControl: thirdCountryPersonalData,
      operationalDependency: knownExposure,
    },
    filesScanned: input.length,
    coverage,
    catalogVersion: catalog.version,
    disclaimer: DISCLAIMER,
  });
}
