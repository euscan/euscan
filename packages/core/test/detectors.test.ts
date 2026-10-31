import { describe, expect, it } from "vitest";
import { detectEnv, detectNpm, isEnvTemplate, isPackageJson, lineAt, nameMatches } from "@euscan/core";
import { packageJson, service } from "./helpers.js";

describe("nameMatches", () => {
  it("matches exact names", () => {
    expect(nameMatches("resend", "resend")).toBe(true);
    expect(nameMatches("resend", "resend-extra")).toBe(false);
  });

  it("matches prefixes for patterns ending in *", () => {
    expect(nameMatches("@aws-sdk/*", "@aws-sdk/client-s3")).toBe(true);
    expect(nameMatches("AWS_*", "AWS_SECRET_ACCESS_KEY")).toBe(true);
    expect(nameMatches("@aws-sdk/*", "aws-sdk")).toBe(false);
  });
});

describe("lineAt", () => {
  it("returns 1-based line numbers", () => {
    const text = "a\nb\nc";
    expect(lineAt(text, 0)).toBe(1);
    expect(lineAt(text, 2)).toBe(2);
    expect(lineAt(text, 4)).toBe(3);
  });
});

describe("isPackageJson / isEnvTemplate", () => {
  it("recognises package.json anywhere", () => {
    expect(isPackageJson("package.json")).toBe(true);
    expect(isPackageJson("apps/web/package.json")).toBe(true);
    expect(isPackageJson("package.json.bak")).toBe(false);
  });

  it("recognises env templates but never real .env files", () => {
    expect(isEnvTemplate(".env.example")).toBe(true);
    expect(isEnvTemplate("apps/api/.env.sample")).toBe(true);
    expect(isEnvTemplate(".env")).toBe(false);
    expect(isEnvTemplate(".env.local")).toBe(false);
    expect(isEnvTemplate(".env.production")).toBe(false);
  });
});

describe("detectNpm", () => {
  const services = [service(), service({ id: "aws", name: "AWS", detect: { npm: ["@aws-sdk/*"] }, alternatives: [] })];

  it("finds runtime dependencies with the right line", () => {
    const content = packageJson({ next: "14.0.0", resend: "^4.0.0" });
    const matches = detectNpm({ path: "package.json", content }, services);
    expect(matches).toEqual([
      { serviceId: "resend", file: "package.json", line: 5, match: "resend", detector: "npm", kind: "runtime" },
    ]);
  });

  it("marks devDependencies as dev", () => {
    const content = packageJson({}, { resend: "^4.0.0" });
    expect(detectNpm({ path: "package.json", content }, services)[0]?.kind).toBe("dev");
  });

  it("finds the line inside the right section when a name appears twice", () => {
    const content = packageJson({ resend: "^4.0.0" }, { resend: "^4.0.0" });
    const lines = detectNpm({ path: "package.json", content }, services).map((m) => [m.kind, m.line]);
    expect(lines).toEqual([
      ["runtime", 4],
      ["dev", 7],
    ]);
  });

  it("matches scoped packages through wildcard patterns", () => {
    const content = packageJson({ "@aws-sdk/client-s3": "^3.0.0" });
    expect(detectNpm({ path: "package.json", content }, services).map((m) => m.serviceId)).toEqual(["aws"]);
  });

  it("ignores invalid JSON and non-package files", () => {
    expect(detectNpm({ path: "package.json", content: "{ not json" }, services)).toEqual([]);
    expect(detectNpm({ path: "README.md", content: packageJson({ resend: "1" }) }, services)).toEqual([]);
  });
});

describe("detectEnv", () => {
  const services = [service()];

  it("finds variable names, with or without export, and skips comments", () => {
    const content = ["# RESEND_API_KEY=commented", "", "export RESEND_API_KEY=", "OTHER=1"].join("\n");
    expect(detectEnv({ path: ".env.example", content }, services)).toEqual([
      { serviceId: "resend", file: ".env.example", line: 3, match: "RESEND_API_KEY", detector: "env", kind: "config" },
    ]);
  });

  it("never reads real .env files", () => {
    expect(detectEnv({ path: ".env", content: "RESEND_API_KEY=secret" }, services)).toEqual([]);
  });

  it("handles Windows line endings", () => {
    const content = "A=1\r\nRESEND_API_KEY=\r\n";
    expect(detectEnv({ path: ".env.example", content }, services)[0]?.line).toBe(2);
  });
});
