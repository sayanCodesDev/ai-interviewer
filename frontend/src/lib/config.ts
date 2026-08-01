export const BACKEND_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BACKEND_URL)
    ? import.meta.env.VITE_BACKEND_URL
    : "https://35.171.0.30.nip.io";
// export const BACKEND_URL = "http://localhost:2000";//YOUR_NE