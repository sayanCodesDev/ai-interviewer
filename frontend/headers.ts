import { createHash } from "node:crypto";

/** Every inline <script> in a built page, so the Content-Security-Policy can allow exactly those and nothing else. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1]?.trim()) hashes.add(`'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
  }
  return [...hashes];
}

/**
 * The `_headers` file (Netlify and Cloudflare Pages format) for the static site: a strict CSP, the usual
 * hardening headers, and long-lived caching for content-hashed files.
 *
 * The CSP allows our own origin plus the API origin. Style attributes need 'unsafe-inline' (React and the
 * animation library set them, and so does the code editor); scripts do not, only the hashed inline theme
 * snippet and our own files run.
 */
interface HeaderInput {
  backendUrl: string;
  scriptHashes: string[];
}

/** The hardening headers every response carries, as name/value pairs, so each hosting format can render them. */
export function securityHeaders({ backendUrl, scriptHashes }: HeaderInput): Array<[string, string]> {
  const api = new URL(backendUrl).origin;
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`,
    "media-src 'self' blob: mediastream:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when the API is on https; otherwise this would rewrite its requests to a port that doesn't speak TLS.
    ...(api.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return [
    ["Content-Security-Policy", csp],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=(), usb=()"],
    ["Strict-Transport-Security", "max-age=31536000"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
  ];
}

/** nginx `add_header` lines for the same headers (include this in the server block and in any location that adds its own headers). */
export function buildNginxHeaders(input: HeaderInput): string {
  return securityHeaders(input).map(([name, value]) => `add_header ${name} "${value.replace(/(["\\$])/g, "\\$1")}" always;`).join("\n") + "\n";
}

export function buildHeaders(input: HeaderInput): string {
  const immutable = "  Cache-Control: public, max-age=31536000, immutable";
  return [
    "/*",
    ...securityHeaders(input).map(([name, value]) => `  ${name}: ${value}`),
    "/chunk-*",
    immutable,
    "/font-*",
    immutable,
    // The path is stamped with the monaco-editor version (see monaco-setup.ts), so an upgrade is a new URL
    // and this can be cached forever like the hashed chunks above, instead of the week-long compromise a
    // stable path would need — which could otherwise serve a returning visitor a stale loader.js after a
    // monaco-editor upgrade, one that asks the new deploy for chunk files that no longer exist.
    "/monaco/*",
    immutable,
    "/og.png",
    "  Cache-Control: public, max-age=86400",
    "",
  ].join("\n");
}
