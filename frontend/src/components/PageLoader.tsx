import { LogoMark } from "@/components/brand/Logo";

export function PageLoader({ label = "Loading" }: { label?: string }) {
    return (
        <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
            <LogoMark animated className="size-10" />
            <p className="label-mono text-muted-foreground">{label}</p>
        </div>
    );
}
