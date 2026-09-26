// Backend origin. Set VITE_BACKEND_URL in frontend/.env for local dev and in frontend/.env.production for the
// deployed build. build.ts replaces this exact expression with the value at build time, so it has to be written
// as a plain `import.meta.env.VITE_BACKEND_URL`: guarding it (`import.meta.env && ...`, `?.`) stops the replacement,
// and in a browser `import.meta.env` does not exist, so the guard would always fall through to the default.
export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL || "http://localhost:2000";
