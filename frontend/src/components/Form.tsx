import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { BACKEND_URL } from "../lib/config";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Interview } from "./Interview.js";
import { Navbar } from "./Navbar";
import { AnimatedBackground } from "./AnimatedBackground";

export function Form() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");

    const [githubUrl, setGithubUrl] = useState("");
    const [linkedinUrl, setLinkedinUrl] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit() {
        if (!githubUrl || !linkedinUrl) {
            toast.warning("URL inputs cannot be empty", { position: "bottom-right" })
            return;
        }

        setLoading(true);

        try {
            await axios.post(`${BACKEND_URL}/api/pre-interview`, {
                githubUrl,
                linkedinUrl
            });
            navigate(`/interview?userId=${userId || ""}`);
        } catch (err: any) {
            toast.error(err.response?.data?.msg || "Failed to submit URLs");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-screen flex flex-col bg-[#f0f4f8] dark:bg-[#0d0e12] transition-colors duration-200">
            <Navbar />
            
            <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <AnimatedBackground />

                <div className="w-full max-w-md p-8 rounded-2xl bg-white/80 dark:bg-[#161822]/80 border border-[#d2dfec] dark:border-[#2b2e42]/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] flex flex-col gap-6 relative z-10 text-[#2c3e50] dark:text-white">
                    <div className="flex flex-col gap-1 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                            AI Interviewer
                        </h1>
                        <p className="text-sm font-light text-gray-500 dark:text-gray-400">
                            Setup your profile to begin the session
                        </p>
                        {userId && (
                            <div className="mt-2 text-xs text-[#5a6e85] dark:text-[#a0aec0] font-light flex items-center justify-center gap-1.5">
                                <span>User ID:</span>
                                <span className="font-mono bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] px-2 py-0.5 rounded text-blue-600 dark:text-sky-400 select-all">
                                    {userId}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0]">
                                Github URL
                            </label>
                            <input 
                                className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#1c1e2d] transition-all duration-200"
                                type="text" 
                                placeholder="https://github.com/your-username" 
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)} 
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0]">
                                Linkedin URL
                            </label>
                            <input 
                                className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#1c1e2d] transition-all duration-200"
                                type="text" 
                                placeholder="https://linkedin.com/in/your-username" 
                                value={linkedinUrl}
                                onChange={(e) => setLinkedinUrl(e.target.value)} 
                            />
                        </div>

                        <button 
                            className="w-full mt-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-medium text-sm py-2.5 px-4 rounded-lg cursor-pointer transition-all shadow-[0_4px_20px_rgba(37,99,235,0.15)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            disabled={loading}
                            onClick={submit}
                        >
                            {loading ? "Starting interview..." : "Start interview"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
