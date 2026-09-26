import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { status, user, wasJustSignedOut, refresh } = useAuth();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    // A session we already know about renders straight away and is re-checked in the
    // background; anything else waits for a fresh check so a stale "signed out" never redirects.
    const [revalidated, setRevalidated] = useState(status === "authenticated");

    useEffect(() => {
        let active = true;
        void refresh({ silent: true }).finally(() => {
            if (active) setRevalidated(true);
        });
        return () => {
            active = false;
        };
    }, [location.pathname, refresh]);

    if (status === "loading" || (!revalidated && status !== "authenticated")) {
        return <PageLoader label="Verifying session" />;
    }

    if (status === "unauthenticated") {
        // Someone who just chose to sign out goes home; an expired or missing session goes to sign-in.
        return wasJustSignedOut() ? <Navigate to="/" replace /> : <Navigate to="/signin" replace state={{ from: location }} />;
    }

    if (user && !searchParams.get("userId")) {
        return <Navigate to={`${location.pathname}?userId=${user.id}`} replace />;
    }

    return <>{children}</>;
}
