import { Button } from "@/components/ui/button";

interface FailedStateProps {
    message: string | null;
    onRetry: () => void;
    onBack: () => void;
}

export function FailedState({ message, onRetry, onBack }: FailedStateProps) {
    return (
        <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-night/95 p-6 text-center">
            <div className="max-w-md">
                <p className="label-mono text-night-muted">Connection</p>
                <h2 className="text-h2 mt-4">We couldn't connect.</h2>
                <p className="mt-4 text-[15px] leading-relaxed text-night-muted">
                    {message || "Something went wrong while starting your interview."}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Button variant="signal" size="lg" onClick={onRetry}>
                        Try again
                    </Button>
                    <Button variant="outline" size="lg" onClick={onBack}>
                        Back to setup
                    </Button>
                </div>
            </div>
        </div>
    );
}
