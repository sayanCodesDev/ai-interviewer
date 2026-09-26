import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AppLayout } from "@/layouts/AppLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

export function NotFound() {
    usePageTitle("Page not found");
    return (
        <AppLayout>
            <div className="app-container flex flex-col items-center py-24 text-center sm:py-32">
                <p className="label-mono text-muted-foreground">404</p>
                <h1 className="text-h2 mt-4">This page doesn't exist.</h1>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                    The link may be broken, or the page may have moved.
                </p>
                <Button asChild size="lg" className="mt-8">
                    <Link to="/">Back to home</Link>
                </Button>
            </div>
        </AppLayout>
    );
}
