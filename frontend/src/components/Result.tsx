import { useSearchParams, useNavigate } from "react-router-dom";
import { Navbar } from "./Navbar";
import { AnimatedBackground } from "./AnimatedBackground";

export function Result() {
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");
    const navigate = useNavigate();

    return (
        <div className="min-h-screen w-screen flex flex-col bg-[#f0f4f8] dark:bg-[#0d0e12] transition-colors duration-200">
            <Navbar />

            <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <AnimatedBackground />

                <div className="w-full max-w-md p-8 rounded-2xl bg-white/80 dark:bg-[#161822]/80 border border-[#d2dfec] dark:border-[#2b2e42]/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] flex flex-col gap-6 text-center relative z-10 text-[#2c3e50] dark:text-white">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                            Interview Completed
                        </h1>
                        <p className="text-sm font-light text-gray-500 dark:text-gray-400">
                            Thank you for taking the time to complete the interview.
                        </p>
                        {userId && (
                            <div className="mt-4 text-xs text-[#5a6e85] dark:text-[#a0aec0] font-light flex flex-col gap-1.5 items-center">
                                <span>Candidate User ID</span>
                                <span className="font-mono bg-[#f8fafc] dark:bg-[#1c1e2d] border border-[#e2e8f0] dark:border-[#2e324a] px-3 py-1 rounded text-blue-600 dark:text-sky-400 select-all">
                                    {userId}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-[#e2e8f0] dark:border-[#2e324a] pt-6">
                        <button 
                            onClick={() => navigate(`/?userId=${userId || ""}`)}
                            className="w-full bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-medium text-sm py-2.5 px-4 rounded-lg cursor-pointer transition-all shadow-[0_4px_20px_rgba(37,99,235,0.15)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.25)] active:scale-[0.98]"
                        >
                            Return to Profile setup
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}