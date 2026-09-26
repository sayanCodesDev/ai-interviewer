import axios from "axios";

import { BACKEND_URL } from "@/lib/config";

/**
 * The access token lives only in memory (never localStorage), so a script injected into the page
 * can't read it back later. The long-lived credential is an httpOnly refresh cookie the browser
 * sends to /api/auth/* on its own; this module trades it for a fresh access token whenever needed.
 */

export interface SessionUser {
    id: string;
    email: string;
    name: string | null;
}

export interface SessionPayload {
    user: SessionUser;
    accessToken: string;
    /** Seconds until the access token expires. */
    expiresIn: number;
}

// Not a secret: it only records that this browser has signed in before, so anonymous visitors don't
// make a doomed refresh request (and log a 401) on every page load.
const SESSION_HINT = "aii:session";
// Refresh a little early so a request never leaves with a token that expires mid-flight.
const EXPIRY_MARGIN_MS = 30_000;

let accessToken: string | null = null;
let expiresAt = 0;
let user: SessionUser | null = null;
let refreshInFlight: Promise<SessionPayload | null> | null = null;
const listeners = new Set<(user: SessionUser | null) => void>();

function writeHint(present: boolean) {
    try {
        if (present) localStorage.setItem(SESSION_HINT, "1");
        else localStorage.removeItem(SESSION_HINT);
    } catch {
        // Storage can be unavailable; the hint is only an optimisation.
    }
}

export function hasSessionHint(): boolean {
    try {
        return localStorage.getItem(SESSION_HINT) === "1";
    } catch {
        return false;
    }
}

function emit() {
    for (const listener of listeners) listener(user);
}

/** Subscribe to sign-in, sign-out and forced expiry. Returns an unsubscribe function. */
export function onSessionChange(listener: (user: SessionUser | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSessionUser(): SessionUser | null {
    return user;
}

export function acceptSession(payload: SessionPayload): void {
    accessToken = payload.accessToken;
    expiresAt = Date.now() + payload.expiresIn * 1000;
    user = payload.user;
    writeHint(true);
    emit();
}

export function clearSession(): void {
    accessToken = null;
    expiresAt = 0;
    user = null;
    writeHint(false);
    emit();
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<SessionPayload | null> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = axios
        .post<SessionPayload>(`${BACKEND_URL}/api/auth/refresh`, undefined, { withCredentials: true })
        .then((response) => {
            acceptSession(response.data);
            return response.data;
        })
        .catch((error) => {
            // Only a definite "no" ends the session. A network blip must not sign anyone out.
            if (axios.isAxiosError(error) && error.response?.status === 401) clearSession();
            return null;
        })
        .finally(() => {
            refreshInFlight = null;
        });

    return refreshInFlight;
}

/** A valid access token, refreshing first when the current one is missing or about to expire. */
export async function ensureAccessToken(): Promise<string | null> {
    if (accessToken && expiresAt - Date.now() > EXPIRY_MARGIN_MS) return accessToken;
    if (!accessToken && !hasSessionHint()) return null;
    const refreshed = await refreshSession();
    return refreshed?.accessToken ?? null;
}

const isAuthRoute = (url: string | undefined) => !!url && url.includes("/api/auth/");

/** Axios client that attaches the access token and retries once after a refresh on a 401. */
export const api = axios.create({ baseURL: BACKEND_URL, withCredentials: true });

api.interceptors.request.use(async (config) => {
    if (isAuthRoute(config.url)) return config;
    const token = await ensureAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(undefined, async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute(original.url)) {
        original._retried = true;
        const refreshed = await refreshSession();
        if (refreshed) {
            original.headers.Authorization = `Bearer ${refreshed.accessToken}`;
            return api(original);
        }
    }
    throw error;
});

/** fetch() with the same token handling, for the few callers that need it (the WebRTC handshake). */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(`${BACKEND_URL}${path}`, { ...init, headers, credentials: "include" });
    };

    let response = await send(await ensureAccessToken());
    if (response.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) response = await send(refreshed.accessToken);
    }
    return response;
}

/** The message the backend attached to a failed request, if any. */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.msg;
        if (typeof msg === "string" && msg) return msg;
    }
    return fallback;
}

/** Per-field messages from a 400, keyed by field name. */
export function apiFieldErrors(error: unknown): Record<string, string> {
    if (axios.isAxiosError(error)) {
        const fields = error.response?.data?.fields;
        if (fields && typeof fields === "object") return fields as Record<string, string>;
    }
    return {};
}
