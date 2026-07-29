import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { BACKEND_URL } from "../lib/config";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "./Navbar";
import { AnimatedBackground } from "./AnimatedBackground";
import { Briefcase, GitBranch } from "lucide-react";

export function Form() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");

    const [targetRole, setTargetRole] = useState("Full Stack Developer");
    const [githubUrl, setGithubUrl] = useState("");
    const [loading, setLoading] = useState(false);

    const rolesList = [
        "Full Stack Developer",
        "Frontend Engineer",
        "Backend Engineer",
        "DevOps / SRE Engineer",
        "Data Engineer",
        "Mobile App Developer (React Native/Flutter)",
        "System Architect / Tech Lead"
    ];



    async function submit() {
        if (!targetRole) {
            toast.warning("Please select or enter a target role", { position: "bottom-right" });
            return;
        }

        setLoading(true);

        try {
            await axios.post(`${BACKEND_URL}/api/pre-interview`, {
                targetRole,
                githubUrl: githubUrl.trim() || undefined
            });
            navigate(`/interview?userId=${userId || ""}`);
        } catch (err: any) {
            toast.error(err.response?.data?.msg || "Failed to setup interview profile");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-screen flex flex-col bg-[#f0f4f8] dark:bg-[#0d0e12] transition-colors duration-200">
            <Navbar />
            
            <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden py-10">
                <AnimatedBackground />

                <div className="w-full max-w-lg p-8 rounded-2xl bg-white/85 dark:bg-[#161822]/85 border border-[#d2dfec] dark:border-[#2b2e42]/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] flex flex-col gap-6 relative z-10 text-[#2c3e50] dark:text-white">
                    <div className="flex flex-col gap-1 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                            Interview Setup
                        </h1>
                        <p className="text-sm font-light text-gray-500 dark:text-gray-400">
                            Customize your target role & background for the AI Interviewer
                        </p>
                    </div>

                    <div className="flex flex-col gap-5">
                        {/* Target Role Selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0] flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                                Target Role / Position *
                            </label>
                            <select
                                value={targetRole}
                                onChange={(e) => setTargetRole(e.target.value)}
                                className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white focus:outline-none focus:border-blue-500 transition-all duration-200 cursor-pointer"
                            >
                                {rolesList.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* GitHub URL (Optional) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-[#5a6e85] dark:text-[#a0aec0] flex items-center gap-1.5">
                                <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                                Github URL (Optional)
                            </label>

                            <input 
                                className="w-full bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] rounded-lg px-3.5 py-2.5 text-sm text-[#2c3e50] dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all duration-200"
                                type="text" 
                                placeholder="https://github.com/your-username" 
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)} 
                            />
                        </div>



                        <button 
                            className="w-full mt-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-semibold text-sm py-3 px-4 rounded-lg cursor-pointer transition-all shadow-[0_4px_20px_rgba(37,99,235,0.15)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            disabled={loading}
                            onClick={submit}
                        >
                            {loading ? "Initializing Session..." : "Start AI Interview"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
