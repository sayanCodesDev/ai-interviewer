import { Pause, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Voice {
    id: string;
    name: string;
    description: string;
}

/** One voice per row, selectable, each with its own sample so it can be heard before it's chosen. */
export function VoicePicker({ voices, value, onChange }: { voices: Voice[]; value: string; onChange: (id: string) => void }) {
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const audio = useRef<HTMLAudioElement | null>(null);
    const objectUrl = useRef<string | null>(null);

    useEffect(
        () => () => {
            audio.current?.pause();
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        },
        [],
    );

    function stop() {
        audio.current?.pause();
        audio.current = null;
        if (objectUrl.current) {
            URL.revokeObjectURL(objectUrl.current);
            objectUrl.current = null;
        }
        setPlayingId(null);
    }

    async function preview(id: string) {
        if (playingId === id) {
            stop();
            return;
        }
        stop();
        setLoadingId(id);
        try {
            const response = await apiFetch(`/api/voices/${encodeURIComponent(id)}/sample`);
            if (!response.ok) throw new Error("sample unavailable");
            const url = URL.createObjectURL(await response.blob());
            objectUrl.current = url;
            const sample = new Audio(url);
            audio.current = sample;
            sample.onended = () => setPlayingId((current) => (current === id ? null : current));
            sample.onerror = () => setPlayingId((current) => (current === id ? null : current));
            await sample.play();
            setPlayingId(id);
        } catch {
            // Quiet failure: the voice can still be picked, just not previewed right now.
        } finally {
            setLoadingId((current) => (current === id ? null : current));
        }
    }

    return (
        <div role="radiogroup" aria-label="Interviewer voice" className="grid gap-1.5 sm:grid-cols-2">
            {voices.map((v) => (
                <label
                    key={v.id}
                    className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-foreground/10 hover:border-foreground/40",
                        value === v.id ? "border-foreground bg-foreground/[0.04]" : "bg-card",
                    )}
                >
                    <input type="radio" name="voice" value={v.id} checked={value === v.id} onChange={() => onChange(v.id)} className="sr-only" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{v.name}</span>
                        <span className="block truncate text-[12.5px] text-muted-foreground">{v.description}</span>
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={playingId === v.id ? `Stop the sample of ${v.name}'s voice` : `Play a sample of ${v.name}'s voice`}
                        onClick={(event) => {
                            event.preventDefault(); // preview, don't also select
                            void preview(v.id);
                        }}
                    >
                        {loadingId === v.id ? <Spinner /> : playingId === v.id ? <Pause /> : <Volume2 />}
                    </Button>
                </label>
            ))}
        </div>
    );
}
