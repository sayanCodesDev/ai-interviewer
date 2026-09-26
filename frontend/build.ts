import tailwind from "bun-plugin-tailwind";
import { rm, cp, readdir } from "node:fs/promises";
import path from "node:path";

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

if (!envVars["import.meta.env.VITE_BACKEND_URL"]) {
  console.warn(
    "⚠️  VITE_BACKEND_URL is not set in frontend/.env.production — the bundle will " +
    "fall back to http://localhost:2000, which will not work once deployed."
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

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
