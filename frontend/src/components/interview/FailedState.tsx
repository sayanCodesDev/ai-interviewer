import { Button } from "@/components/ui/button";

interface FailedStateProps {
    message: string | null;
    /** Set when the interview is over (or can't be resumed), so retrying makes no sense. */
    ended?: boolean;
    onRetry: () => void;
    onBack: () => void;
    backLabel?: string;
}

export function FailedState({ message, ended = false, onRetry, onBack, backLabel = "Back to dashboard" }: FailedStateProps) {
    return (
        <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-night/95 p-6 text-center">
            <div className="max-w-md">
                <p className="label-mono text-night-muted">Connection</p>
                <h2 className="text-h2 mt-4">{ended ? "This interview has ended." : "We couldn't connect."}</h2>
                <p className="mt-4 text-[15px] leading-relaxed text-night-muted">
                    {message || "Something went wrong while starting your interview."}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    {!ended && (
                        <Button variant="signal" size="lg" onClick={onRetry}>
                            Try again
                        </Button>
                    )}
                    <Button variant={ended ? "signal" : "outline"} size="lg" onClick={onBack}>
                        {backLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
