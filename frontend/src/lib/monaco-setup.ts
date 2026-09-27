import { loader } from "@monaco-editor/react";

// Monaco is served from our own origin (copied to /monaco/<version>/vs at build time, and by the dev
// server), not a public CDN: it works offline, never depends on a third party, and lets the CSP stay strict.
//
// The path carries the installed monaco-editor version so its files can be cached forever (see headers.ts).
// Monaco's entry files (loader.js, editor.main.js) are not content-hashed by monaco-editor itself, so an
// unversioned path cached for any length of time can, after a monaco-editor upgrade, serve a returning
// visitor a stale loader.js that then asks the new deploy for chunk files that no longer exist — the panel
// mounts (it's plain React) but Monaco's own text area never finishes loading. Stamping the version into the
// URL means an upgrade is a new URL, so there is nothing to go stale.
const version = typeof __MONACO_VERSION__ !== "undefined" ? __MONACO_VERSION__ : undefined;
export const MONACO_BASE_PATH = version ? `/monaco/${version}/vs` : "/monaco/vs";
loader.config({ paths: { vs: MONACO_BASE_PATH } });

export { loader };
