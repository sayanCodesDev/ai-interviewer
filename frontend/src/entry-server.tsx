import { prerender } from "react-dom/static";
import { StaticRouter } from "react-router-dom";

import { AppContent, AppProviders } from "./App";

/**
 * Renders one route to HTML, waiting for lazy pages to load so the markup is complete.
 * Used only by prerender.ts at build time; nothing here ships to the browser.
 */
export async function renderRoute(url: string): Promise<string> {
    const { prelude } = await prerender(
        <AppProviders>
            <StaticRouter location={url}>
                <AppContent />
            </StaticRouter>
        </AppProviders>,
        {
            onError(error) {
                throw error;
            },
        },
    );
    return await new Response(prelude).text();
}
