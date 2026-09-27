/**
 * Serves dist/ the way a static host that understands public/_redirects does, so the production
 * build can be tested locally: real files first, then the rewrite rules, then a 404. Like a real host
 * it compresses text and applies dist/_headers (CSP, caching).
 *   bun scripts/serve-dist.ts [port]
 */
import { join, normalize } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");
const port = Number(process.argv[2] ?? 4000);

const rules = (await Bun.file(join(DIST, "_redirects")).text())
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    const pattern = new RegExp(`^${from!.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return { pattern, to: to!, status: Number(status ?? 301) };
  });

async function fileFor(pathname: string) {
  const target = normalize(join(DIST, pathname));
  if (!target.startsWith(DIST)) return null;
  for (const candidate of [target, join(target, "index.html")]) {
    const file = Bun.file(candidate);
    if ((await file.exists()) && !candidate.endsWith("/")) {
      try {
        if ((await file.stat()).isFile()) return file;
      } catch {}
    }
  }
  return null;
}

/** Headers from dist/_headers, applied like Netlify does: every block whose pattern matches contributes. */
const headerRules: Array<{ pattern: RegExp; headers: Array<[string, string]> }> = [];
{
  let current: (typeof headerRules)[number] | undefined;
  for (const line of (await Bun.file(join(DIST, "_headers")).text().catch(() => "")).split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) {
      current = { pattern: new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`), headers: [] };
      headerRules.push(current);
    } else {
      const at = line.indexOf(":");
      current?.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
}

const COMPRESSIBLE = /\.(html|js|css|svg|xml|txt|json|map)$/;
async function respond(req: Request, file: Bun.BunFile, status = 200, name = file.name ?? "") {
  const headers = new Headers({ "Content-Type": file.type, "Cache-Control": "no-cache" });
  const { pathname } = new URL(req.url);
  for (const rule of headerRules) if (rule.pattern.test(pathname)) for (const [key, value] of rule.headers) headers.set(key, value);
  if (COMPRESSIBLE.test(name) && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    headers.set("Content-Encoding", "gzip");
    headers.set("Vary", "Accept-Encoding");
    return new Response(Bun.gzipSync(new Uint8Array(await file.arrayBuffer())), { status, headers });
  }
  return new Response(file, { status, headers });
}

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    const direct = await fileFor(pathname);
    if (direct) return respond(req, direct);
    const rule = rules.find((r) => r.pattern.test(pathname));
    if (rule) return respond(req, Bun.file(join(DIST, rule.to)), rule.status);
    return respond(req, Bun.file(join(DIST, "404.html")), 404);
  },
});
console.log(`dist on :${port}`);
