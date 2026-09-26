import { ArrowRight } from "lucide-react";
import { m } from "motion/react";

import { Waveform } from "@/components/audio/Waveform";
import { useStartInterview } from "@/components/landing/useStartInterview";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO, inViewOnce } from "@/lib/motion";

export function FinalCta() {
    const { start, checking } = useStartInterview();
    const level = useSimulatedLevel(true, 11);

    return (
        <section className="page-container pb-24 sm:pb-32">
            <m.div
                className="relative overflow-hidden rounded-[28px] bg-inverse px-6 pt-20 pb-32 text-center text-inverse-foreground sm:px-16 sm:pt-28 sm:pb-36"
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={inViewOnce}
                transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            >
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-[0.12]">
                    <Waveform level={level} maxBars={140} />
                </div>

                <div className="relative">
                    <h2 className="text-display mx-auto max-w-3xl">Ready when you are.</h2>
                    <p className="mx-auto mt-6 max-w-md text-[17px] leading-relaxed opacity-70">
                        Start whenever you like. All you need is a microphone and a few quiet minutes.
                    </p>
                    <Button variant="signal" size="lg" onClick={start} disabled={checking} className="group mt-10">
                        {checking && <Spinner />}
                        Start your interview
                        {!checking && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                    </Button>
                </div>
            </m.div>
        </section>
    );
}
