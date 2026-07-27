import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "../lib/config";

// Enable credentials globally for axios requests
axios.defaults.withCredentials = true;

interface User {
    id: string;
    email: string;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const location = useLocation();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        async function checkAuth() {
            try {
                const response = await axios.get(`${BACKEND_URL}/api/auth/me`);
                if (response.data && response.data.user) {
                    setIsAuthenticated(true);
                    setUser(response.data.user);
                } else {
                    setIsAuthenticated(false);
                }
            } catch (err) {
                setIsAuthenticated(false);
            } finally {
                setLoading(false);
            }
        }
        checkAuth();
    }, [location.pathname]);

    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[#0d0e12] text-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-light text-gray-400">Verifying session...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/signin" replace state={{ from: location }} />;
    }

    // If userId is missing from query params in any protected route, append it.
    if (user && !searchParams.get("userId")) {
        return <Navigate to={`${location.pathname}?userId=${user.id}`} replace />;
    }

    return <>{children}</>;
}
