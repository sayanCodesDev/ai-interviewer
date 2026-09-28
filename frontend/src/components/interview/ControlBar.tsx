import { Captions, CaptionsOff, CodeXml, Keyboard, Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ControlBarProps {
    isMicMuted: boolean;
    onToggleMic: () => void;
    /** Whether the interviewer has already opened an editor (a coding problem or a design pad). */
    editorAvailable: boolean;
    editorVisible: boolean;
    /** Toggles visibility if already open; otherwise asks the server to open whatever the current round has — the candidate's own way in if the interviewer never opened it. */
    onToggleEditor: () => void;
    captionsOn: boolean;
    onToggleCaptions: () => void;
    typeOpen: boolean;
    onToggleType: () => void;
    onEnd: () => void;
    disabled?: boolean;
}

function RoundButton({ label, pressed, onClick, disabled, tone, shortcut, children }: {
    label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; tone?: "danger" | "signal"; shortcut?: string; children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={onClick}
                    disabled={disabled}
                    aria-pressed={pressed}
                    aria-label={label}
                    className={cn(
                        "rounded-full",
                        tone === "danger" && pressed && "bg-night-red/15 text-night-red hover:bg-night-red/25",
                        tone === "signal" && pressed && "bg-signal text-signal-foreground hover:bg-signal/85",
                        !(tone && pressed) && (pressed ? "bg-accent text-night-foreground" : "bg-night text-night-foreground hover:bg-accent"),
                    )}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                {label} {shortcut && <Kbd>{shortcut}</Kbd>}
            </TooltipContent>
        </Tooltip>
    );
}

export function ControlBar(props: ControlBarProps) {
    const { isMicMuted, onToggleMic, editorAvailable, editorVisible, onToggleEditor, captionsOn, onToggleCaptions, typeOpen, onToggleType, onEnd, disabled = false } = props;

    return (
        <div className="flex shrink-0 justify-center px-4 pt-1 pb-4">
            <div className="flex items-center gap-1.5 rounded-full border border-night-line bg-night-raised p-1.5 sm:gap-2">
                <RoundButton label={isMicMuted ? "Unmute microphone" : "Mute microphone"} pressed={isMicMuted} tone="danger" onClick={onToggleMic} disabled={disabled} shortcut="M">
                    {isMicMuted ? <MicOff /> : <Mic />}
                </RoundButton>
                <RoundButton label={captionsOn ? "Hide captions" : "Show captions"} pressed={captionsOn} onClick={onToggleCaptions} disabled={disabled} shortcut="C">
                    {captionsOn ? <Captions /> : <CaptionsOff />}
                </RoundButton>
                <RoundButton label={typeOpen ? "Close text box" : "Type instead of speaking"} pressed={typeOpen} onClick={onToggleType} disabled={disabled} shortcut="T">
                    <Keyboard />
                </RoundButton>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="lg"
                            onClick={onToggleEditor}
                            disabled={disabled}
                            aria-pressed={editorAvailable && editorVisible}
                            aria-label={!editorAvailable ? "Open the code editor or whiteboard" : editorVisible ? "Hide editor" : "Show editor"}
                            className={cn(
                                "rounded-full px-4 sm:px-5",
                                editorAvailable && editorVisible ? "bg-signal text-signal-foreground hover:bg-signal/85" : "bg-night text-night-foreground hover:bg-accent",
                            )}
                        >
                            <CodeXml />
                            <span className="hidden sm:inline">{editorAvailable ? "Editor" : "Open editor"}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {!editorAvailable ? "Open the editor or whiteboard yourself, if the interviewer hasn't yet" : editorVisible ? "Hide editor" : "Show editor"} <Kbd>E</Kbd>
                    </TooltipContent>
                </Tooltip>

                <div aria-hidden className="mx-1 h-6 w-px bg-night-line" />

                <Button variant="destructive" size="lg" onClick={onEnd} disabled={disabled} className="rounded-full px-4 sm:px-6">
                    End<span className="hidden sm:inline"> interview</span>
                </Button>
            </div>
        </div>
    );
}
