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
export function buildHeaders({ backendUrl, scriptHashes }: { backendUrl: string; scriptHashes: string[] }): string {
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

  const immutable = "  Cache-Control: public, max-age=31536000, immutable";
  return [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
    "  Strict-Transport-Security: max-age=31536000",
    "  Cross-Origin-Opener-Policy: same-origin",
    "/chunk-*",
    immutable,
    "/font-*",
    immutable,
    // The editor's files are not content-hashed, so let them be revalidated after a week.
    "/monaco/*",
    "  Cache-Control: public, max-age=604800",
    "/og.png",
    "  Cache-Control: public, max-age=86400",
    "",
  ].join("\n");
}
