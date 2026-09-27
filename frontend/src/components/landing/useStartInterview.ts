import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

/** Sends signed-in visitors to interview setup and everyone else to sign in. */
export function useStartInterview() {
    const navigate = useNavigate();
    const { status, user, refresh } = useAuth();
    const [checking, setChecking] = useState(false);

    const start = useCallback(async () => {
        setChecking(true);
        try {
            const current = status === "authenticated" ? user : await refresh();
            navigate(current ? "/setup" : "/signin");
        } finally {
            setChecking(false);
        }
    }, [navigate, refresh, status, user]);

    return { start, checking };
}
