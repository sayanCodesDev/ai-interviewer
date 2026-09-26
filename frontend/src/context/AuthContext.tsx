import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    acceptSession,
    api,
    clearSession,
    ensureAccessToken,
    getSessionUser,
    hasSessionHint,
    onSessionChange,
    type SessionPayload,
} from "@/lib/api";

export interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
    status: AuthStatus;
    user: AuthUser | null;
    /** True for a few seconds after the user chose to sign out, so route guards can send them home instead of to sign-in. */
    wasJustSignedOut: () => boolean;
    /** Make sure there is a valid session, refreshing the access token if it is stale. Concurrent calls share one request. */
    refresh: (options?: { silent?: boolean }) => Promise<AuthUser | null>;
    /** Store the result of a successful sign-in or sign-up. */
    acceptSession: (payload: SessionPayload) => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [user, setUser] = useState<AuthUser | null>(null);
    const signedOutAt = useRef(0);
    const inFlight = useRef<Promise<AuthUser | null> | null>(null);

    const refresh = useCallback(async (options?: { silent?: boolean }) => {
        if (inFlight.current) return inFlight.current;

        if (!options?.silent) setStatus((current) => (current === "authenticated" ? current : "loading"));

        const request = ensureAccessToken()
            .then((token) => (token ? getSessionUser() : null))
            .catch(() => null)
            .then((nextUser) => {
                setUser(nextUser);
                setStatus(nextUser ? "authenticated" : "unauthenticated");
                return nextUser;
            })
            .finally(() => {
                inFlight.current = null;
            });

        inFlight.current = request;
        return request;
    }, []);

    const signOut = useCallback(async () => {
        signedOutAt.current = Date.now();
        try {
            await api.post("/api/auth/logout");
        } catch {
            // The session may already be gone server-side; clear it locally regardless.
        } finally {
            clearSession();
        }
    }, []);

    // Follow sign-in, sign-out and a refresh token being refused, wherever they happen.
    useEffect(
        () =>
            onSessionChange((next) => {
                setUser(next);
                setStatus(next ? "authenticated" : "unauthenticated");
            }),
        [],
    );

    useEffect(() => {
        // A browser that has never signed in has nothing to refresh: skip the request entirely.
        if (!hasSessionHint()) {
            setStatus("unauthenticated");
            return;
        }
        void refresh();
    }, [refresh]);

    const wasJustSignedOut = useCallback(() => Date.now() - signedOutAt.current < 3000, []);

    const value = useMemo(
        () => ({ status, user, wasJustSignedOut, refresh, acceptSession, signOut }),
        [status, user, wasJustSignedOut, refresh, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
