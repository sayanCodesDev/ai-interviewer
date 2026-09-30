import { serve } from "bun";
import { join, normalize } from "node:path";
import index from "./index.html";

// Monaco (the code editor) is served from this origin instead of a public CDN. `bun run build`
// copies the same files into dist/monaco for static hosting.
const MONACO_ROOT = join(import.meta.dir, "..", "node_modules", "monaco-editor", "min");

// The design-round whiteboard's stylesheet (see DesignCanvas.tsx and build.ts) needs the same static
// serving in dev, or the whiteboard opens with no CSS at all: an unstyled, unusably laid-out toolbar.
const EXCALIDRAW_ROOT = join(import.meta.dir, "..", "node_modules", "@excalidraw", "excalidraw", "dist", "prod");

// The landing demo's voice clips live in public/demo, which the production build copies to dist; in dev they are served from here.
const DEMO_AUDIO_ROOT = join(import.meta.dir, "..", "public", "demo");

function staticAssetRoute(root: string) {
  return async (req: Request) => {
    const prefix = new URL(req.url).pathname.split("/")[1]!;
    const relative = decodeURIComponent(new URL(req.url).pathname.slice(prefix.length + 2));
    const file = normalize(join(root, relative));
    // Never serve anything outside the asset's own folder.
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 });
    const asset = Bun.file(file);
    return (await asset.exists()) ? new Response(asset) : new Response("Not found", { status: 404 });
  };
}

const server = serve({
  routes: {
    "/monaco/*": staticAssetRoute(MONACO_ROOT),
    "/excalidraw/*": staticAssetRoute(EXCALIDRAW_ROOT),
    "/demo/*": staticAssetRoute(DEMO_AUDIO_ROOT),

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
