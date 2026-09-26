import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CaptionItem {
    id: string;
    role: "interviewer" | "candidate";
    text: string;
    final: boolean;
}

/** Applies a caption event: replaces the entry with the same id (it grows as speech arrives), or appends. */
export function applyCaption(list: CaptionItem[], next: CaptionItem): CaptionItem[] {
    const index = list.findIndex((item) => item.id === next.id);
    if (index >= 0) {
        const copy = [...list];
        copy[index] = next;
        return copy;
    }
    return [...list, next].slice(-200);
}

/** The latest exchange as live captions. Not announced to screen readers: the voice already speaks these words. */
export function CaptionStrip({ captions }: { captions: CaptionItem[] }) {
    const lastInterviewer = [...captions].reverse().find((c) => c.role === "interviewer");
    const lastCandidate = [...captions].reverse().find((c) => c.role === "candidate");
    // Show whichever spoke last first, so the eye lands on what is happening now.
    const ordered = [lastInterviewer, lastCandidate].filter((c): c is CaptionItem => !!c);
    ordered.sort((a, b) => captions.indexOf(a) - captions.indexOf(b));
    if (ordered.length === 0) return null;

    return (
        <div aria-hidden className="mx-auto mb-2 grid w-full max-w-3xl gap-1 px-4 text-center">
            {ordered.slice(-2).map((caption) => (
                <p
                    key={caption.id}
                    className={cn(
                        "line-clamp-2 text-[14px] leading-snug transition-opacity duration-300",
                        caption.role === "interviewer" ? "text-night-foreground" : "text-night-muted italic",
                        !caption.final && "opacity-80",
                    )}
                >
                    <span className="label-mono mr-2 not-italic opacity-60">{caption.role === "interviewer" ? "Interviewer" : "You"}</span>
                    {tail(caption.text)}
                </p>
            ))}
        </div>
    );
}

/** Long lines show their most recent words, so the caption follows what is being said now. */
function tail(text: string, max = 200): string {
    if (text.length <= max) return text;
    const cut = text.slice(-max);
    return `…${cut.slice(cut.indexOf(" ") + 1)}`;
}

export function TypeBox({ onSend, disabled }: { onSend: (text: string) => boolean; disabled?: boolean }) {
    const [text, setText] = useState("");
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => input.current?.focus(), []);

    return (
        <form
            className="mx-auto mb-2 flex w-full max-w-xl items-center gap-2 px-4"
            onSubmit={(event) => {
                event.preventDefault();
                const trimmed = text.trim();
                if (!trimmed) return;
                if (onSend(trimmed)) setText("");
            }}
        >
            <label className="sr-only" htmlFor="type-answer">Type your answer</label>
            <input
                id="type-answer"
                ref={input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={1500}
                placeholder="Type your answer, then press Enter"
                autoComplete="off"
                disabled={disabled}
                className="h-10 min-w-0 flex-1 rounded-full border border-night-line bg-night-raised px-4 text-sm outline-none placeholder:text-night-muted focus-visible:border-signal/60"
            />
            <Button type="submit" variant="signal" size="icon-lg" className="rounded-full" aria-label="Send" disabled={disabled || !text.trim()}>
                <Send />
            </Button>
        </form>
    );
}

export function TranscriptDialog({ open, onOpenChange, captions }: { open: boolean; onOpenChange: (open: boolean) => void; captions: CaptionItem[] }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Live transcript</DialogTitle>
                    <DialogDescription>Everything said so far. The full transcript is saved with your report.</DialogDescription>
                </DialogHeader>
                <ol className="grid max-h-[55dvh] gap-3 overflow-y-auto pr-1">
                    {captions.map((caption) => (
                        <li key={caption.id} className="text-sm leading-relaxed">
                            <span className="label-mono mr-2 text-muted-foreground">{caption.role === "interviewer" ? "Interviewer" : "You"}</span>
                            {caption.text}
                        </li>
                    ))}
                    {captions.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
                </ol>
            </DialogContent>
        </Dialog>
    );
}
