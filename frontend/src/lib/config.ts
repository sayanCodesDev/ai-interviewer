// Backend origin. Set VITE_BACKEND_URL in frontend/.env for local dev and in
// frontend/.env.production for the deployed build; both are inlined at build time.
const configuredUrl =
    typeof import.meta !== "undefined" && import.meta.env
        ? import.meta.env.VITE_BACKEND_URL
        : undefined;

export const BACKEND_URL: string = configuredUrl || "http://localhost:2000";
