import tailwind from "bun-plugin-tailwind";
import { rm, cp, readdir } from "node:fs/promises";
import path from "node:path";
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

if (!envVars["import.meta.env.VITE_BACKEND_URL"]) {
  console.warn(
    "⚠️  VITE_BACKEND_URL is not set in frontend/.env.production — the bundle will " +
    "fall back to http://localhost:2000, which will not work once deployed."
  );
}

if (!envVars["import.meta.env.VITE_SITE_URL"]) {
  console.warn(
    "⚠️  VITE_SITE_URL is not set in frontend/.env.production — canonical URLs, the sitemap and " +
    "social previews will point at https://ai-interviewer.example.com instead of your domain."
  );
}

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
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
    ...envVars,
  },
});

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

// The code editor is served from our own origin. Copy its runtime (loader, workers, languages) next to the app.
const monacoSource = path.join(process.cwd(), "node_modules", "monaco-editor", "min", "vs");
try {
  await cp(monacoSource, path.join(outdir, "monaco", "vs"), { recursive: true });
  console.log(" Copied monaco-editor runtime to dist/monaco/vs");
} catch {
  console.warn("⚠️  Could not copy monaco-editor. Run `bun install` so the code editor works in this build.");
}

// A stable URL for the logo (the bundled copy has a hashed name).
await cp(path.join(process.cwd(), "src", "favicon.svg"), path.join(outdir, "favicon.svg"));

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
for (const [key, value] of Object.entries(envVars)) process.env[key.replace("import.meta.env.", "")] = JSON.parse(value);
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
