import { CodeXml, Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ControlBarProps {
    isMicMuted: boolean;
    onToggleMic: () => void;
    editorOpen: boolean;
    onToggleEditor: () => void;
    onEnd: () => void;
    disabled?: boolean;
}

export function ControlBar({ isMicMuted, onToggleMic, editorOpen, onToggleEditor, onEnd, disabled = false }: ControlBarProps) {
    return (
        <div className="flex shrink-0 justify-center px-4 pt-1 pb-4">
            <div className="flex items-center gap-2 rounded-full border border-night-line bg-night-raised p-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-lg"
                            onClick={onToggleMic}
                            disabled={disabled}
                            aria-pressed={isMicMuted}
                            aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                            className={cn(
                                "rounded-full",
                                isMicMuted ? "bg-night-red/15 text-night-red hover:bg-night-red/25" : "bg-night text-night-foreground hover:bg-accent",
                            )}
                        >
                            {isMicMuted ? <MicOff /> : <Mic />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {isMicMuted ? "Unmute" : "Mute"} <Kbd>M</Kbd>
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="lg"
                            onClick={onToggleEditor}
                            disabled={disabled}
                            aria-pressed={editorOpen}
                            aria-label={editorOpen ? "Close code editor" : "Open code editor"}
                            className={cn(
                                "rounded-full px-4 sm:px-5",
                                editorOpen ? "bg-signal text-signal-foreground hover:bg-signal/85" : "bg-night text-night-foreground hover:bg-accent",
                            )}
                        >
                            <CodeXml />
                            <span className="hidden sm:inline">Code editor</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {editorOpen ? "Close editor" : "Open editor"} <Kbd>E</Kbd>
                    </TooltipContent>
                </Tooltip>

                <div aria-hidden className="mx-1 h-6 w-px bg-night-line" />

                <Button variant="destructive" size="lg" onClick={onEnd} disabled={disabled} className="rounded-full px-5 sm:px-6">
                    End interview
                </Button>
            </div>
        </div>
    );
}
