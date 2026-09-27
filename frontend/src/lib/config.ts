// Backend origin. Set VITE_BACKEND_URL in frontend/.env for local dev and in frontend/.env.production for the
// deployed build. The build (build.ts) replaces __VITE_BACKEND_URL__ with the value, so a deployed bundle carries its
// own address. It is a bare global rather than `import.meta.env.X` on purpose: `import.meta.env` does not exist in a
// browser, so reading through it either crashes (the dev server) or silently never sees the value (a production
// bundle, when guarded). `typeof` makes a missing global safe, and the dev server simply uses the default.
export const BACKEND_URL: string = (typeof __VITE_BACKEND_URL__ !== "undefined" ? __VITE_BACKEND_URL__ : undefined) || "http://localhost:2000";
