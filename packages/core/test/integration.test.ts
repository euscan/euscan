import { describe, expect, it } from "vitest";
import { isIntegrationPath } from "@euscan/core";

describe("isIntegrationPath", () => {
  it("recognises plugin, provider, app-store and workflow-node folders", () => {
    for (const path of [
      "packages/providers/email-sendgrid/package.json",
      "packages/plugins/sentry/package.json",
      "packages/app-store/stripepayment/package.json",
      "packages/pieces/community/openai/package.json",
      "packages/nodes-base/package.json",
      "integrations/slack/.env.example",
      "src/Connectors/hubspot/package.json",
    ]) {
      expect(isIntegrationPath(path), path).toBe(true);
    }
  });

  it("ignores the project's own code and file names that look similar", () => {
    for (const path of [
      "package.json",
      "apps/web/package.json",
      "packages/core/package.json",
      "packages/provider-utils-core/package.json",
      "plugins.json",
      "docs/plugins-guide/package.json",
    ]) {
      expect(isIntegrationPath(path), path).toBe(false);
    }
  });
});
