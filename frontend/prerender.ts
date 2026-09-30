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

import { FAQ } from "./src/content/faq";
import { FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "./src/content/roles.generated";
import { PUBLIC_PATHS, SITE_NAME, SITE_URL, TAGLINE, abs, canonicalUrl, seoFor, type Seo } from "./src/seo";
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
        // Here rather than in index.html: Bun's HTML bundler tries to bundle every URL it finds there, and these are plain
        // files copied from public/. Every built page (the app shell and 404 included) gets them.
        `<meta name="application-name" content="${escapeAttr(SITE_NAME)}" />`,
        `<meta name="apple-mobile-web-app-title" content="${escapeAttr(SITE_NAME)}" />`,
        `<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />`,
        `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
        `<link rel="manifest" href="/site.webmanifest" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:locale" content="en_US" />`,
        `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
        `<meta property="og:title" content="${escapeAttr(seo.title)}" />`,
        `<meta property="og:description" content="${escapeAttr(seo.description)}" />`,
        url ? `<meta property="og:url" content="${escapeAttr(url)}" />` : "",
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:type" content="image/png" />`,
        `<meta property="og:image:alt" content="${escapeAttr(`${SITE_NAME}: ${TAGLINE}`)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeAttr(seo.title)}" />`,
        `<meta name="twitter:description" content="${escapeAttr(seo.description)}" />`,
        `<meta name="twitter:image" content="${image}" />`,
        `<meta name="twitter:image:alt" content="${escapeAttr(`${SITE_NAME}: ${TAGLINE}`)}" />`,
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

    // Every page is rebuilt from the same content on each build, so the build date is an honest last-modified date.
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = PUBLIC_PATHS.map((route) => `  <url><loc>${escapeText(canonicalUrl(seoFor(route))!)}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    await write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /setup\nDisallow: /lobby/\nDisallow: /interview/\nDisallow: /report/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    await write("llms.txt", llmsTxt());

    console.log(` Prerendered ${PUBLIC_PATHS.length} public pages, app.html, 404.html, sitemap.xml, robots.txt, llms.txt`);
}

/**
 * /llms.txt (llmstxt.org): a plain summary of the site for AI assistants and AI search, which quote a clear
 * description more readily than they piece one together from a JavaScript app. Built from the same content as the pages.
 */
function llmsTxt(): string {
    const home = seoFor("/");
    return [
        `# ${SITE_NAME}`,
        "",
        `> ${home.description}`,
        "",
        `${SITE_NAME} is an AI mock interviewer for software engineers. You give it the job you're preparing for (the role, your level, the job description, your resume and GitHub), and an AI interviewer runs a realistic technical interview with you out loud: questions about your background and projects, live coding against hidden tests in ${PRODUCT_STATS.languages.join(", ")}, technical and behavioral questions, and system design on a whiteboard. The difficulty adapts as you go. Afterwards you get a scored report out of 100 with feedback quoted from your own transcript and a prioritised study plan.`,
        "",
        `Interview formats: ${FORMAT_CONTENT.map((f) => `${f.label} (${f.minutes} min)`).join(", ")}.`,
        "",
        "## Pages",
        "",
        `- [Home](${abs("/")}): what ${SITE_NAME} is and how an interview works`,
        `- [Mock interviews by role](${abs("/mock-interviews")}): every role, with what its interview covers`,
        ...ROLE_CONTENT.map((role) => `- [${role.role} mock interview](${abs(`/mock-interviews/${role.slug}`)}): ${role.summary}`),
        `- [Privacy](${abs("/privacy")})`,
        `- [Terms](${abs("/terms")})`,
        "",
        "## FAQ",
        "",
        ...FAQ.flatMap((item) => [`### ${item.q}`, "", item.a, ""]),
    ].join("\n");
}
