import axios from "axios";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/config";

export interface AuthUser {
    id: string;
    email: string;
    name?: string;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
    status: AuthStatus;
    user: AuthUser | null;
    /** True for a few seconds after the user chose to sign out, so route guards can send them home instead of to sign-in. */
    wasJustSignedOut: () => boolean;
    /** Re-check the session with the backend. Concurrent calls share one request. */
    refresh: (options?: { silent?: boolean }) => Promise<AuthUser | null>;
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

        const request = axios
            .get(`${BACKEND_URL}/api/auth/me`)
            .then((response) => (response.data?.user as AuthUser | undefined) ?? null)
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
            await axios.post(`${BACKEND_URL}/api/auth/logout`);
        } catch {
            // The session may already be gone server-side; clear it locally regardless.
        } finally {
            try {
                localStorage.removeItem("token");
            } catch {
                // ignore
            }
            setUser(null);
            setStatus("unauthenticated");
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const wasJustSignedOut = useCallback(() => Date.now() - signedOutAt.current < 3000, []);

    const value = useMemo(
        () => ({ status, user, wasJustSignedOut, refresh, signOut }),
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
