import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "../lib/config";
import { Navbar } from "./Navbar";
import { AnimatedBackground } from "./AnimatedBackground";
import {
    Sparkles,
    Bot,
    Code2,
    Clock,
    GitBranch,
    ShieldCheck,
    Zap,
    Target,
    TrendingUp,
    ArrowRight,
    CheckCircle2,
    Cpu,
    Volume2
} from "lucide-react";

export function LandingPage() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 40) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    async function handleStartSession() {
        setCheckingAuth(true);
        try {
            const response = await axios.get(`${BACKEND_URL}/api/auth/me`);
            if (response.data && response.data.user) {
                navigate(`/setup?userId=${response.data.user.id}`);
            } else {
                navigate("/signin");
            }
        } catch {
            navigate("/signin");
        } finally {
            setCheckingAuth(false);
        }
    }


    return (
        <div className="min-h-screen w-full bg-[#f8fafc] dark:bg-[#0d0e12] text-[#1e293b] dark:text-[#f1f5f9] transition-colors duration-300 flex flex-col font-sans overflow-x-hidden selection:bg-blue-500 selection:text-white">
            <Navbar />

            {/* HERO SECTION */}
            <section className="relative min-h-[90vh] flex flex-col justify-center items-center px-4 py-20 overflow-hidden">
                <AnimatedBackground />

                {/* Decorative floating blur spheres */}
                <div className="absolute top-1/4 left-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
                <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-sky-400/20 dark:bg-sky-500/20 rounded-full blur-3xl pointer-events-none animate-pulse delay-1000" />

                <div className="relative z-10 max-w-5xl text-center flex flex-col items-center gap-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-sky-400 text-xs sm:text-sm font-semibold backdrop-blur-md shadow-sm transform hover:scale-105 transition-all duration-300">
                        <Sparkles className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Next-Gen Voice-Native AI Technical Interviewer</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.15]">
                        Master Technical Interviews with Real-Time <br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 bg-clip-text text-transparent">
                            AI Voice & Code Evaluation
                        </span>
                    </h1>

                    <p className="max-w-2xl text-base sm:text-xl text-slate-600 dark:text-slate-300 font-normal leading-relaxed">
                        Experience ultra-low latency voice technical interviews powered by Groq LLM & Deepgram. We analyze your GitHub, evaluate your code live, and benchmark your progress.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4 mt-4 w-full sm:w-auto">
                        <button
                            onClick={handleStartSession}
                            disabled={checkingAuth}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-semibold text-base shadow-[0_10px_30px_rgba(37,99,235,0.3)] hover:shadow-[0_15px_35px_rgba(37,99,235,0.45)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-60"
                        >
                            <span>{checkingAuth ? "Checking Session..." : "Start Interview Session"}</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>


                        <a
                            href="#features"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-white/80 dark:bg-[#161822]/80 hover:bg-slate-50 dark:hover:bg-[#1e2235] text-slate-700 dark:text-slate-200 font-medium text-base backdrop-blur-md shadow-sm transition-all duration-200"
                        >
                            Explore Features
                        </a>
                    </div>

                    {/* Stats pills */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full max-w-4xl text-left">
                        {[
                            { label: "Voice Latency", val: "< 500ms", icon: Zap },
                            { label: "GitHub Code Scrape", val: "Automatic", icon: GitBranch },
                            { label: "Languages Supported", val: "JS, Python, C++, Java", icon: Code2 },
                            { label: "Timer & Auto Guard", val: "Enabled", icon: Clock },
                        ].map((stat, idx) => (
                            <div key={idx} className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-[#141622]/60 backdrop-blur-md flex items-center gap-3">
                                <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-sky-400">
                                    <stat.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stat.label}</div>
                                    <div className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">{stat.val}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* WHAT THIS WEB APP DOES & HOW IT HELPS */}
            <section id="features" className="py-24 px-4 sm:px-8 max-w-7xl mx-auto w-full relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
                        Everything You Need to <br />
                        <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                            Crack Senior Technical Rounds
                        </span>
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 text-lg">
                        Simulate top-tier tech company interviews with a dynamic AI interviewer that adapts to your code, speaks naturally, and gives you instant structural feedback.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        {
                            title: "GitHub Context Scraper",
                            desc: "Connect your GitHub. The AI silently inspects your recent repositories and code structure to tailor realistic technical questions based on your actual tech stack.",
                            icon: GitBranch,
                            badge: "Smart Tailoring"
                        },
                        {
                            title: "Ultra-Low Latency Voice",
                            desc: "Real-time speech synthesis powered by Deepgram & Groq LLM. Engage in natural multi-turn conversations without awkward pauses or delays.",
                            icon: Volume2,
                            badge: "Human-like Speed"
                        },
                        {
                            title: "Embedded Code Editor",
                            desc: "Write code directly inside an integrated syntax-highlighted IDE modal. Complete with a 10-minute timer lock, custom language selection, and automatic execution.",
                            icon: Code2,
                            badge: "Interactive IDE"
                        },
                        {
                            title: "No-Teaching Evaluative Prompting",
                            desc: "The AI conducts itself like a real Senior Principal Engineer. It asks sharp complexity questions, checks edge cases, and evaluates logic without lecturing.",
                            icon: Target,
                            badge: "Rigorously Realistic"
                        },
                        {
                            title: "Interactive Timer & Security",
                            desc: "Features explicit code submission locks and smart candidate alerts if code execution takes excessive time or encounters syntax errors.",
                            icon: ShieldCheck,
                            badge: "Proctored Flow"
                        },
                        {
                            title: "Comprehensive Result Analytics",
                            desc: "Receive actionable breakdowns of your problem-solving accuracy, space/time complexity performance, and verbal communication clarity.",
                            icon: TrendingUp,
                            badge: "Instant Insights"
                        }
                    ].map((feature, idx) => (
                        <div
                            key={idx}
                            className="group p-8 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#141624]/70 backdrop-blur-xl hover:border-blue-500/50 dark:hover:border-sky-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transform hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-sky-500/10 text-blue-600 dark:text-sky-400 group-hover:scale-110 transition-transform duration-300">
                                        <feature.icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        {feature.badge}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-sky-400 transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                                    {feature.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS SECTION */}
            <section className="py-20 px-4 bg-slate-100/70 dark:bg-[#121420]/70 border-y border-slate-200 dark:border-slate-800/80 backdrop-blur-md relative">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <span className="text-blue-600 dark:text-sky-400 text-sm font-semibold tracking-wider uppercase">Simple 4-Step Process</span>
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">How Your Interview Unfolds</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                        {[
                            { step: "01", title: "Setup Profile", text: "Provide your GitHub & LinkedIn handles to allow context scraping." },
                            { step: "02", title: "Voice Greeting", text: "AI introduces itself & engages in natural background exploration." },
                            { step: "03", title: "Live Coding", text: "Editor unlocks automatically with tailored DSA questions and a timer." },
                            { step: "04", title: "Feedback Report", text: "Submit your code to receive deep time/space complexity analysis." }
                        ].map((item, idx) => (
                            <div key={idx} className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181a28] shadow-sm flex flex-col gap-3 relative">
                                <span className="text-4xl font-black text-blue-500/20 dark:text-sky-400/20">{item.step}</span>
                                <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{item.title}</h4>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA SECTION */}
            <section className="py-24 px-4 text-center relative overflow-hidden">
                <div className="max-w-4xl mx-auto p-10 sm:p-16 rounded-3xl bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-500 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col items-center gap-6">
                        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Ready to Elevate Your Interview Game?</h2>
                        <p className="text-blue-100 text-base sm:text-lg max-w-xl">
                            Start practicing now with our AI Senior Principal Staff Engineer. No scheduling required.
                        </p>
                        <button
                            onClick={handleStartSession}
                            disabled={checkingAuth}
                            className="mt-2 px-8 py-4 rounded-xl bg-white hover:bg-slate-100 text-blue-600 font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                        >
                            {checkingAuth ? "Checking Session..." : "Get Started Free"}
                        </button>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="mt-auto py-8 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p>© {new Date().getFullYear()} AI Interviewer Platform. Built for developers worldwide.</p>
                    <div className="flex gap-6">
                        <a href="#features" className="hover:underline">Features</a>
                        <button onClick={handleStartSession} className="hover:underline">Interview Setup</button>
                    </div>
                </div>

            </footer>
        </div>
    );
}
