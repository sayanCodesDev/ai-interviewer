import { useSyncExternalStore } from "react";

/**
 * Whether a media query currently matches. Renders as false on the server and during hydration (so the
 * markup matches the prerendered HTML), then follows the real value.
 */
export function useMediaQuery(query: string) {
    return useSyncExternalStore(
        (notify) => {
            const list = window.matchMedia(query);
            list.addEventListener("change", notify);
            return () => list.removeEventListener("change", notify);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
