export { scan, gradeFor } from "./scan.js";
export { detectNpm, isPackageJson } from "./detectors/npm.js";
export { detectEnv, isEnvTemplate } from "./detectors/env.js";
export { nameMatches, lineAt, type RawMatch } from "./match.js";
export { isIntegrationPath } from "./integration.js";
