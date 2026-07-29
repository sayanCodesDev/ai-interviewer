import tailwind from "bun-plugin-tailwind";
import { rm, cp, readdir } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

// Read env variables from .env for injection
const envVars: Record<string, string> = {};
const envFile = Bun.file(path.join(process.cwd(), ".env"));
if (await envFile.exists()) {
  const envText = await envFile.text();
  for (const line of envText.split("\n")) {
    const match = line.match(/^(VITE_[^=]+)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      envVars[`import.meta.env.${match[1]}`] = JSON.stringify(match[2].trim());
    }
  }
}

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
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
