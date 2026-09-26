import { loader } from "@monaco-editor/react";

// Monaco is served from our own origin (copied to /monaco/vs at build time, and by the dev server),
// not a public CDN: it works offline, never depends on a third party, and lets the CSP stay strict.
loader.config({ paths: { vs: "/monaco/vs" } });

export { loader };
