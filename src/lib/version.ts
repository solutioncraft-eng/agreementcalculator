import pkg from "../../package.json";

/**
 * Application version stamped onto every exported PDF and audit event.
 * `APP_BUILD` is set at deploy time (commit sha) so a document can be traced
 * back to the exact build that produced it.
 */
export const APP_VERSION = `v${pkg.version}`;
export const APP_BUILD = process.env.APP_BUILD ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
export const APP_VERSION_STAMP = `${APP_VERSION} (${APP_BUILD.slice(0, 7)})`;
