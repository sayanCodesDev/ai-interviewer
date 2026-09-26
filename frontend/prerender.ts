/**
 * Turns the client build into a crawlable static site. Runs at the end of build.ts.
 *
 *   dist/index.html, dist/mock-interviews/**, dist/privacy, dist/terms  real HTML with its own title,
 *                                       description, canonical, Open Graph tags and JSON-LD, hydrated in the browser
 *   dist/app.html                       empty shell for the signed-in app (noindex)
 *   dist/404.html                       "not found" page, served with a 404 status (noindex)
 *   dist/sitemap.xml, dist/robots.txt   generated from the public routes
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

import { PUBLIC_PATHS, SITE_NAME, SITE_URL, canonicalUrl, seoFor, type Seo } from "./src/seo";
import { renderRoute } from "./src/entry-server";

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
/** JSON inside <script> must not be able to close the tag. */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function headTags(seo: Seo, fontFiles: string[]): string {
    const url = canonicalUrl(seo);
    const image = `${SITE_URL}/og.png`;
    const tags = [
        `<title>${escapeText(seo.title)}</title>`,
        `<meta name="description" content="${escapeAttr(seo.description)}" />`,
        `<meta name="robots" content="${seo.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
        url ? `<link rel="canonical" href="${escapeAttr(url)}" />` : "",
        // Fetch the fonts alongside the stylesheet instead of after it. Bun can't do this from index.html, so it is added here.
        ...fontFiles.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`),
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
        `<meta property="og:title" content="${escapeAttr(seo.title)}" />`,
        `<meta property="og:description" content="${escapeAttr(seo.description)}" />`,
        url ? `<meta property="og:url" content="${escapeAttr(url)}" />` : "",
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="${escapeAttr(`${SITE_NAME}: the technical interview that talks back`)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeAttr(seo.title)}" />`,
        `<meta name="twitter:description" content="${escapeAttr(seo.description)}" />`,
        `<meta name="twitter:image" content="${image}" />`,
        ...seo.jsonLd.map((item) => `<script type="application/ld+json" data-seo-jsonld="1">${safeJson(item)}</script>`),
    ];
    return tags.filter(Boolean).join("\n  ");
}

/** Drops the placeholder title and social tags from index.html so each page can bring its own. */
function stripDefaultHead(html: string): string {
    return html
        .replace(/<!--[\s\S]*?written per page by prerender\.ts[\s\S]*?-->\s*/i, "")
        .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
        .replace(/<meta\s+(?:name="(?:description|robots)"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/gi, "");
}

export interface PrerenderOptions {
    outdir: string;
    /** Public URLs of the bundled .woff2 files. */
    fontFiles: string[];
}

export async function prerenderSite({ outdir, fontFiles }: PrerenderOptions): Promise<void> {
    const template = await readFile(path.join(outdir, "index.html"), "utf8");
    const base = stripDefaultHead(template);
    if (!/<meta name="viewport"/i.test(base) || !base.includes('<div id="root"></div>')) throw new Error('prerender: dist/index.html is missing the viewport meta or <div id="root"></div>');

    const page = (seo: Seo, body: string) =>
        // Function replacers: page text may contain "$&" or "$1", which a string replacement would expand.
        base.replace(/(<meta name="viewport"[^>]*>)/i, (viewport) => `${viewport}\n  ${headTags(seo, fontFiles)}`).replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);

    const write = async (file: string, contents: string) => {
        const target = path.join(outdir, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, contents);
    };

    // The blank shell has to be captured before "/" overwrites index.html.
    await write("app.html", page(seoFor("/app"), ""));

    for (const route of PUBLIC_PATHS) {
        const html = page(seoFor(route), await renderRoute(route));
        await write(route === "/" ? "index.html" : `${route.slice(1)}/index.html`, html);
    }

    await write("404.html", page(seoFor("/404"), await renderRoute("/404")));

    const urls = PUBLIC_PATHS.map((route) => `  <url><loc>${escapeText(canonicalUrl(seoFor(route))!)}</loc></url>`).join("\n");
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    await write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /setup\nDisallow: /lobby/\nDisallow: /interview/\nDisallow: /report/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

    console.log(` Prerendered ${PUBLIC_PATHS.length} public pages, app.html, 404.html, sitemap.xml, robots.txt`);
}
