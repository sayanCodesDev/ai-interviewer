import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { BACKEND_URL } from "../lib/config";
import { AnimatedBackground } from "./AnimatedBackground";

export function Signup() {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault();
        if (!name || !email || !password) {
            toast.warning("All fields are required");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${BACKEND_URL}/api/auth/signup`, {
                name,
                email,
                password
            });
            toast.success("Successfully registered! Signing you in...");
            navigate(`/?userId=${response.data.userId}`);
        } catch (error: any) {
            const errorMsg = error.response?.data?.msg || "Failed to sign up. Please try again.";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-[#f0f4f8] dark:bg-[#0d0e12] text-[#2c3e50] dark:text-white p-4 relative overflow-hidden transition-colors duration-200">
            <AnimatedBackground />

            <div className="w-full max-w-md p-8 rounded-2xl bg-white/80 dark:bg-[#161822]/80 border border-[#d2dfec] dark:border-[#2b2e42]/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] flex flex-col gap-6 relative z-10">
                <div className="flex flex-col gap-1 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                        Create Account
                    </h1>
                    <p className="text-sm font-light text-gray-500 dark:text-gray-400">
                        Sign up to start using the AI Interviewer
                    </p>
                </div>

                <form onSubmit={handleSignup} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0]">
                            Full Name
                        </label>
                        <input
                            type="text"
                            placeholder="John Doe"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#1c1e2d] transition-all duration-200"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0]">
                            Email Address
                        </label>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#1c1e2d] transition-all duration-200"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0]">
                            Password
                        </label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#1c1e2d] transition-all duration-200"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-medium text-sm py-2.5 px-4 rounded-lg cursor-pointer transition-all shadow-[0_4px_20px_rgba(37,99,235,0.15)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {loading ? "Registering..." : "Sign Up"}
                    </button>
                </form>

                <div className="text-center text-sm font-light text-gray-500 dark:text-gray-400 mt-2">
                    Already have an account?{" "}
                    <Link to="/signin" className="text-blue-600 hover:text-blue-500 font-semibold transition-colors">
                        Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
