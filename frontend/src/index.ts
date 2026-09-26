import { serve } from "bun";
import { join, normalize } from "node:path";
import index from "./index.html";

// Monaco (the code editor) is served from this origin instead of a public CDN. `bun run build`
// copies the same files into dist/monaco for static hosting.
const MONACO_ROOT = join(import.meta.dir, "..", "node_modules", "monaco-editor", "min");

const server = serve({
  routes: {
    "/monaco/*": async (req) => {
      const relative = decodeURIComponent(new URL(req.url).pathname.slice("/monaco/".length));
      const file = normalize(join(MONACO_ROOT, relative));
      // Never serve anything outside the editor's own folder.
      if (!file.startsWith(MONACO_ROOT)) return new Response("Not found", { status: 404 });
      const asset = Bun.file(file);
      return (await asset.exists()) ? new Response(asset) : new Response("Not found", { status: 404 });
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
