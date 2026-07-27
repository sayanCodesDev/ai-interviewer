export function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] rounded-full bg-gradient-to-br from-blue-400/30 via-sky-300/20 to-transparent dark:from-blue-600/15 dark:via-sky-500/10 blur-[120px] animate-float-slow" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tl from-indigo-400/25 via-blue-300/15 to-transparent dark:from-indigo-600/12 dark:via-blue-500/8 blur-[120px] animate-float-medium" />
      <div className="absolute top-[40%] left-[30%] w-[40%] h-[40%] rounded-full bg-gradient-to-tr from-cyan-300/20 via-teal-200/10 to-transparent dark:from-cyan-600/8 dark:via-teal-500/5 blur-[120px] animate-float-fast" />

      {/* Subtle dot grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] animate-drift"
        style={{
          backgroundImage: "radial-gradient(circle, #2563eb 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          width: "200%",
          height: "100%",
        }}
      />

      {/* Floating particles */}
      <div className="absolute top-[20%] left-[15%] w-1.5 h-1.5 rounded-full bg-blue-400/60 dark:bg-blue-400/30 animate-particle-1" />
      <div className="absolute top-[60%] left-[70%] w-2 h-2 rounded-full bg-indigo-400/50 dark:bg-indigo-400/25 animate-particle-2" />
      <div className="absolute top-[30%] left-[55%] w-1 h-1 rounded-full bg-cyan-400/50 dark:bg-cyan-400/25 animate-particle-3" />
      <div className="absolute top-[75%] left-[20%] w-1.5 h-1.5 rounded-full bg-sky-400/40 dark:bg-sky-400/20 animate-particle-2" style={{ animationDelay: "-3s" }} />
      <div className="absolute top-[45%] left-[85%] w-1 h-1 rounded-full bg-blue-300/50 dark:bg-blue-300/25 animate-particle-1" style={{ animationDelay: "-5s" }} />
      <div className="absolute top-[10%] left-[45%] w-2 h-2 rounded-full bg-teal-400/40 dark:bg-teal-400/20 animate-particle-3" style={{ animationDelay: "-7s" }} />

      {/* Corner accent glows */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-gradient-to-br from-blue-500/5 to-transparent dark:from-blue-500/10 rounded-full -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-indigo-500/5 to-transparent dark:from-indigo-500/8 rounded-full translate-x-1/3 translate-y-1/3 animate-pulse-glow" style={{ animationDelay: "-2s" }} />
    </div>
  );
}
