export const BACKEND_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BACKEND_URL) 
    ? import.meta.env.VITE_BACKEND_URL 
    : "http://34.203.242.69:2000";
