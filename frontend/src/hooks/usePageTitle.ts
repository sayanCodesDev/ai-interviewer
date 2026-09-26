import { useEffect } from "react";

const SUFFIX = "AI Interviewer";

/** Sets the browser tab title while the calling page is mounted. */
export function usePageTitle(title: string) {
    useEffect(() => {
        const previous = document.title;
        document.title = `${title} · ${SUFFIX}`;
        return () => {
            document.title = previous;
        };
    }, [title]);
}
