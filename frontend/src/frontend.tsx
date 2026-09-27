/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import "./index.css";
import "./fonts.css";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.js";

const elem = document.getElementById("root")!;
const app = <App />;

// Public pages ship prerendered (see prerender.ts): attach to that HTML instead of replacing it.
// Everything else starts from an empty shell and renders from scratch.
if (import.meta.hot) {
  // https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
  (import.meta.hot.data.root ??= createRoot(elem)).render(app);
} else if (elem.hasChildNodes()) {
  hydrateRoot(elem, app);
} else {
  createRoot(elem).render(app);
}
