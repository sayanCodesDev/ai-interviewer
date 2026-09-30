import tailwind from "bun-plugin-tailwind";
import { rm, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { fixEs6PromisePoolInterop } from "./build-plugins/fixEs6PromisePoolInterop";
import { buildHeaders, buildNginxHeaders, inlineScriptHashes } from "./headers";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

// Read VITE_* variables for injection. `.env.production` is loaded last so it
// wins for a production bundle, while `.env` keeps holding the local dev values.
const envVars: Record<string, string> = {};
for (const envFileName of [".env", ".env.production"]) {
  const envFile = Bun.file(path.join(process.cwd(), envFileName));
  if (!(await envFile.exists())) continue;

  const envText = await envFile.text();
  for (const line of envText.split("\n")) {
    const match = line.match(/^\s*(VITE_[^=\s]+)\s*=\s*(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      // Strip surrounding quotes and any trailing `#` comment.
      const value = match[2].replace(/\s+#.*$/, "").trim().replace(/^["'](.*)["']$/, "$1");
      envVars[`import.meta.env.${match[1]}`] = JSON.stringify(value);
    }
  }
}

// Variables set in the shell win over the files, e.g. `VITE_BACKEND_URL=http://localhost:2000 bun run build` for a local test of the production build.
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("VITE_") && value !== undefined) envVars[`import.meta.env.${key}`] = JSON.stringify(value);
}

// Every variable the app reads is always defined. If one were left undefined, `import.meta.env.VITE_X` would be
// evaluated in the browser, where `import.meta.env` doesn't exist, and throw. An empty string means "not set".
for (const key of ["VITE_BACKEND_URL", "VITE_SITE_URL", "VITE_CONTACT_EMAIL"]) {
  envVars[`import.meta.env.${key}`] ??= JSON.stringify("");
}
// The app reads these as bare globals (src/globals.d.ts), which the bundler replaces with the values.
const settingGlobals: Record<string, string> = {};
for (const key of ["VITE_BACKEND_URL", "VITE_SITE_URL", "VITE_CONTACT_EMAIL"]) {
  settingGlobals[`__${key}__`] = envVars[`import.meta.env.${key}`]!;
}

// The installed monaco-editor version, so its files can be served from a versioned, cache-forever path
// (see monaco-setup.ts and the /monaco/* rule below).
const monacoVersion: string = JSON.parse(await Bun.file(path.join(process.cwd(), "node_modules", "monaco-editor", "package.json")).text()).version;
settingGlobals.__MONACO_VERSION__ = JSON.stringify(monacoVersion);
const isSet = (key: string) => JSON.parse(envVars[`import.meta.env.${key}`] ?? '""') !== "";

if (!isSet("VITE_BACKEND_URL")) {
  console.warn(
    "⚠️  VITE_BACKEND_URL is not set in frontend/.env.production — the bundle will " +
    "fall back to http://localhost:2000, which will not work once deployed."
  );
}

if (!isSet("VITE_SITE_URL")) {
  console.warn(
    "⚠️  VITE_SITE_URL is not set in frontend/.env.production — canonical URLs, the sitemap and " +
    "social previews will point at https://intervyu.example.com instead of your domain."
  );
}

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind, fixEs6PromisePoolInterop],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  // The lazy routes (landing, interview) become their own chunks, and absolute URLs
  // let every chunk and font resolve no matter which route the page was loaded from.
  splitting: true,
  publicPath: "/",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.PROD": "true",
    "import.meta.env.DEV": "false",
    "import.meta.env.MODE": JSON.stringify("production"),
    // A dependency (jotai, pulled in by @excalidraw/excalidraw) checks the bare `import.meta.env` object's
    // truthiness rather than a specific property; without this Bun leaves the reference unresolved.
    "import.meta.env": '{"PROD":true,"DEV":false,"MODE":"production"}',
    ...settingGlobals,
  },
});

// Bun's own build output correctly labels one JS artifact as the app's entry point (`kind: "entry-point"`),
// but — reproduced with a minimal build, so this is Bun's bug, not a one-off — the <script type="module">
// tag it writes into the HTML can reference a different, unrelated chunk instead when the module graph is
// large enough (as it now is, with Excalidraw pulled in for the design-round whiteboard). That leaves the
// app bootstrapping nothing: an empty #root, no console error, because the wrong chunk loads and executes
// fine, it just never calls createRoot. Force the HTML to reference the artifact Bun's own metadata says is
// actually the entry, rather than trusting what it wrote into the tag.
{
  const entryArtifact = result.outputs.find((o) => o.kind === "entry-point" && o.path.endsWith(".js"));
  if (!entryArtifact) throw new Error("build: Bun reported no JS entry-point artifact — cannot verify the app's bootstrap script.");
  const entryHref = `/${path.basename(entryArtifact.path)}`;
  const indexPath = path.join(outdir, "index.html");
  const html = await Bun.file(indexPath).text();
  const scriptTag = /<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/.exec(html);
  if (!scriptTag) throw new Error("build: could not find the app's <script type=\"module\"> tag in dist/index.html to verify.");
  if (scriptTag[1] !== entryHref) {
    console.warn(`⚠️  Bun referenced the wrong entry chunk in dist/index.html (${scriptTag[1]}, not the real entry ${entryHref}) — correcting it.`);
    await Bun.write(indexPath, html.replace(scriptTag[0], scriptTag[0].replace(scriptTag[1]!, entryHref)));
  }
}

// Copy public/ folder to dist/ (includes _redirects for Netlify, etc.)
const publicDir = path.join(process.cwd(), "public");
try {
  const files = await readdir(publicDir);
  if (files.length > 0) {
    await cp(publicDir, outdir, { recursive: true });
    console.log(` Copied ${files.length} file(s) from public/`);
  }
} catch {
  // No public folder — that's fine
}

// The code editor is served from our own origin, at a path stamped with its version (see monaco-setup.ts):
// copy its runtime (loader, workers, languages) next to the app.
const monacoSource = path.join(process.cwd(), "node_modules", "monaco-editor", "min", "vs");
try {
  await cp(monacoSource, path.join(outdir, "monaco", monacoVersion, "vs"), { recursive: true });
  console.log(` Copied monaco-editor ${monacoVersion} runtime to dist/monaco/${monacoVersion}/vs`);
} catch {
  console.warn("⚠️  Could not copy monaco-editor. Run `bun install` so the code editor works in this build.");
}

// A stable URL for the logo (the bundled copy has a hashed name).
await cp(path.join(process.cwd(), "src", "favicon.svg"), path.join(outdir, "favicon.svg"));

// The design-round whiteboard's stylesheet, served as a static file for the same reason Monaco is above:
// its package export is gated behind non-standard conditions that, if satisfied via Bun.build's own
// `conditions` option, changed which chunk Bun treated as the app's entry script. See DesignCanvas.tsx.
// Its one @font-face rule references "./fonts/Assistant/..." relative to the stylesheet's own URL, so that
// folder has to travel with it or the toolbar silently falls back to the browser's default font.
try {
  const excalidrawProd = path.join(process.cwd(), "node_modules", "@excalidraw", "excalidraw", "dist", "prod");
  await cp(path.join(excalidrawProd, "index.css"), path.join(outdir, "excalidraw", "index.css"));
  await cp(path.join(excalidrawProd, "fonts", "Assistant"), path.join(outdir, "excalidraw", "fonts", "Assistant"), { recursive: true });
} catch {
  console.warn("⚠️  Could not copy Excalidraw's stylesheet and font. Run `bun install` so the design-round whiteboard is styled.");
}

// `import.meta.env` doesn't exist in a browser. If any of it survived into the bundle, that code reads
// `undefined` (or throws) there, and a setting like the API address silently falls back to its default.
{
  const leftovers: string[] = [];
  for (const output of result.outputs.filter((o) => o.path.endsWith(".js"))) {
    const text = await output.text();
    for (const match of text.matchAll(/import\.meta\.env/g)) leftovers.push(`${path.basename(output.path)}: ...${text.slice(Math.max(0, match.index! - 40), match.index! + 60).replace(/\s+/g, " ")}...`);
  }
  if (leftovers.length > 0) {
    console.error("The bundle still contains `import.meta.env`, which does not exist in a browser:\n  " + leftovers.slice(0, 5).join("\n  "));
    process.exit(1);
  }
}

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun inlines the font files into the stylesheet as base64, which made the stylesheet (render-blocking) 200 KB.
// Move each one back out to a file the browser can cache and fetch in parallel with the CSS.
const preloadFonts: string[] = [];
for (const output of result.outputs.filter((o) => o.path.endsWith(".css"))) {
  let css = await output.text();
  const pattern = /@font-face\{([^}]*?)url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
  css = css.replace(pattern, (whole, before: string, base64: string) => {
    const bytes = Buffer.from(base64, "base64");
    const name = `font-${Bun.hash(bytes).toString(36)}.woff2`;
    Bun.write(path.join(outdir, name), bytes);
    // Only the faces used above the fold are worth preloading.
    if (/font-family:(Geist Variable|Instrument Serif);font-style:normal/.test(before)) preloadFonts.push(`/${name}`);
    return `@font-face{${before}url(/${name})`;
  });
  await Bun.write(output.path, css);
}

// Turn the public pages into real HTML files for crawlers and first paint. The site URL and contact
// address are read from the environment at run time by the pages themselves.
for (const [name, value] of Object.entries(settingGlobals)) (globalThis as Record<string, unknown>)[name] = JSON.parse(value);
const { prerenderSite } = await import("./prerender");
await prerenderSite({ outdir, fontFiles: preloadFonts });

const backendUrl = JSON.parse(envVars["import.meta.env.VITE_BACKEND_URL"] ?? '"http://localhost:2000"') || "http://localhost:2000";
const headerInput = { backendUrl, scriptHashes: inlineScriptHashes(await Bun.file(path.join(outdir, "app.html")).text()) };
await Bun.write(path.join(outdir, "_headers"), buildHeaders(headerInput));
// The same headers for nginx (used by frontend/Dockerfile). Not served publicly: nginx.conf includes it from /etc/nginx.
await Bun.write(path.join(outdir, "nginx-headers.conf"), buildNginxHeaders(headerInput));

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
