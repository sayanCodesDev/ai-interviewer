import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { canonicalUrl, seoFor } from "@/seo";

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attribute, key);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

/**
 * Keeps the document head in step with the current route as the visitor navigates. The first page load
 * already carries the right head (written at build time); this handles client-side navigation.
 */
export function SeoManager() {
    const { pathname } = useLocation();

    useEffect(() => {
        const seo = seoFor(pathname);
        document.title = seo.title;
        setMeta('meta[name="description"]', "name", "description", seo.description);
        setMeta('meta[name="robots"]', "name", "robots", seo.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
        setMeta('meta[property="og:title"]', "property", "og:title", seo.title);
        setMeta('meta[property="og:description"]', "property", "og:description", seo.description);
        setMeta('meta[name="twitter:title"]', "name", "twitter:title", seo.title);
        setMeta('meta[name="twitter:description"]', "name", "twitter:description", seo.description);

        const url = canonicalUrl(seo);
        let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (url) {
            if (!link) {
                link = document.createElement("link");
                link.rel = "canonical";
                document.head.appendChild(link);
            }
            link.href = url;
            setMeta('meta[property="og:url"]', "property", "og:url", url);
        } else link?.remove();

        document.head.querySelectorAll("script[data-seo-jsonld]").forEach((node) => node.remove());
        for (const item of seo.jsonLd) {
            const script = document.createElement("script");
            script.type = "application/ld+json";
            script.dataset.seoJsonld = "1";
            script.textContent = JSON.stringify(item);
            document.head.appendChild(script);
        }
    }, [pathname]);

    return null;
}

