/**
 * Folder names that hold connectors a project offers to its own users (plugins, providers,
 * app stores, workflow nodes). Dependencies declared there are integrations, not services the
 * project itself relies on.
 */
const INTEGRATION_SEGMENT =
  /^(providers?|plugins?|integrations?|connectors?|adapters?|extensions?|app-store|apps-store|pieces|nodes|nodes-[a-z0-9-]+)$/;

/** True when any folder in the path (not the file name) is an integration folder. */
export function isIntegrationPath(path: string): boolean {
  const segments = path.split("/").slice(0, -1);
  return segments.some((segment) => INTEGRATION_SEGMENT.test(segment.toLowerCase()));
}
