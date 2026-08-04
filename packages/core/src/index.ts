/**
 * Read-only release-status primitives for App Store Connect and Google Play.
 *
 * ```ts
 * import { createSnapshot } from "@storepulse/core";
 *
 * const snapshot = createSnapshot([]);
 * ```
 *
 * @module
 */
export * from "./connector.js";
export { AscConnector, type AscCredentials, createAscToken } from "./connectors/asc.js";
export {
  createPlayAccessToken,
  GooglePlayConnector,
  type GooglePlayCredentials,
  PlayTokenExchangeError,
} from "./connectors/google-play.js";
export { MockConnector } from "./connectors/mock.js";
export * from "./enricher.js";
export {
  EAS_GRAPHQL_ENDPOINT,
  type EasCredentials,
  EasEnricher,
  EasGraphqlError,
  type EasProject,
  type EasViewer,
  fetchEasProject,
  fetchEasViewer,
  matchEasBuild,
} from "./enrichers/eas.js";
export * from "./i18n/index.js";
export * from "./snapshot.js";
export * from "./types.js";
