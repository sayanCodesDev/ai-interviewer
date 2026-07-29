import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { BACKEND_URL } from "../lib/config";
import { useTheme } from "./ThemeContext";
import { Sun, Moon, LogOut, User } from "lucide-react";

export function Navbar() {
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");
    const [name, setName] = useState<string>("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await axios.get(`${BACKEND_URL}/api/auth/me`, { withCredentials: true });
                if (response.data && response.data.user) {
                    setName(response.data.user.name || "User");
                    setIsLoggedIn(true);
                } else {
                    setIsLoggedIn(false);
                }
            } catch (err) {
                setIsLoggedIn(false);
            }
        }
        fetchUser();
    }, []);

    async function handleLogout() {
        try {
            await axios.post(`${BACKEND_URL}/api/auth/logout`);
            toast.success("Logged out successfully");
            navigate("/signin");
        } catch (err) {
            toast.error("Logout failed");
        }
    }

    // Get initials of the name
    const initials = name
        ? name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
        : "U";

    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#e2e8f0] dark:border-[#1e293b] bg-white/70 dark:bg-[#0d0e12]/70 backdrop-blur-md transition-colors duration-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex justify-between items-center">
                {/* Logo / Title */}
                <div className="flex items-center gap-2">
                    <span 
                        onClick={() => navigate(userId ? `/?userId=${userId}` : "/")}
                        className="text-xl font-bold bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent cursor-pointer"
                    >
                        AI Interviewer
                    </span>
                </div>

                {/* Right Side Options */}
                <div className="flex items-center gap-4">
                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg border border-[#e2e8f0] dark:border-[#1e293b] bg-white/80 dark:bg-[#1c1e2d]/80 hover:bg-[#f8fafc] dark:hover:bg-[#25283c] text-[#5a6e85] dark:text-[#a0aec0] cursor-pointer transition-all duration-200 shadow-sm"
                        title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
                    >
                        {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                    </button>

                    {/* Profile Badge + Logout — only when logged in */}
                    {isLoggedIn && (
                        <>
                            {name && (
                                <div className="flex items-center gap-2.5 bg-[#f0f4f8] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#1e293b] px-3.5 py-1.5 rounded-full shadow-sm">
                                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                                        {initials}
                                    </div>
                                    <span className="text-sm font-semibold text-[#2c3e50] dark:text-[#e2e8f0] max-w-[120px] truncate">
                                        {name}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-1.5 text-sm font-semibold text-[#5a6e85] dark:text-[#a0aec0] hover:text-red-500 dark:hover:text-red-400 border border-[#e2e8f0] dark:border-[#1e293b] bg-white/80 dark:bg-[#1c1e2d]/80 hover:bg-[#f8fafc] dark:hover:bg-[#25283c] px-4 py-2 rounded-lg cursor-pointer transition-all duration-200 shadow-sm"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">Log Out</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
