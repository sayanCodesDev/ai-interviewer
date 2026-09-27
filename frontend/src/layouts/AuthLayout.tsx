import { m } from "motion/react";

import { Waveform } from "@/components/audio/Waveform";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO } from "@/lib/motion";

const EXPECT = [
    { title: "A quick hello", text: "Introduce yourself and your background." },
    { title: "Live coding problems", text: "Solve data structures and algorithms problems in an editor beside the conversation." },
    { title: "Follow-up questions", text: "Talk through time and space complexity, and whether there's a better approach." },
    { title: "Spoken feedback", text: "The interviewer closes with how it went and what to sharpen." },
];

function AuthAside() {
    const level = useSimulatedLevel(true, 3);

    return (
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-night p-12 text-night-foreground lg:flex">
            <div>
                <p className="label-mono text-night-muted">What to expect</p>
                <ol className="mt-8">
                    {EXPECT.map((item, index) => (
                        <m.li
                            key={item.title}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.15 + index * 0.09 }}
                            className="flex gap-6 border-t border-night-line py-6"
                        >
                            <span className="font-mono text-xs text-night-muted">{String(index + 1).padStart(2, "0")}</span>
                            <div>
                                <h2 className="font-serif text-[26px] leading-tight tracking-tight">{item.title}</h2>
                                <p className="mt-2 max-w-sm text-sm leading-relaxed text-night-muted">{item.text}</p>
                            </div>
                        </m.li>
                    ))}
                </ol>
            </div>

            <div>
                <div className="h-14 text-signal opacity-80">
                    <Waveform level={level} maxBars={56} />
                </div>
                <p className="label-mono mt-6 text-night-muted">Microphone required · No camera</p>
            </div>
        </aside>
    );
}

interface AuthLayoutProps {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    footer: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
    return (
        <div className="grid min-h-screen lg:grid-cols-2">
            <div className="flex flex-col px-5 py-5 sm:px-10">
                <div className="flex h-10 items-center justify-between">
                    <Logo />
                    <ThemeToggle />
                </div>

                <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
                    <h1 className="text-h2">{title}</h1>
                    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
                    <div className="mt-8">{children}</div>
                    <p className="mt-8 text-sm text-muted-foreground">{footer}</p>
                </div>
            </div>

            <AuthAside />
        </div>
    );
}
