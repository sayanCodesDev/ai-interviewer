import { FAQ } from "@/content/faq";
import { BEHAVIORAL_SAMPLES, FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "@/content/roles.generated";

export const SITE_NAME = "Intervyu";

/** The public origin, used for canonical URLs and the sitemap. Set VITE_SITE_URL for the deployed build. */
// A build-time global, on purpose: see src/lib/config.ts.
const configuredSiteUrl: string | undefined = typeof __VITE_SITE_URL__ !== "undefined" ? __VITE_SITE_URL__ : undefined;
export const SITE_URL: string = (configuredSiteUrl || "https://intervyu.example.com").replace(/\/+$/, "");

export interface Seo {
    title: string;
    description: string;
    /** The canonical path, or null for pages that should not be indexed at all. */
    canonical: string | null;
    noindex: boolean;
    jsonLd: object[];
}

/** One sentence that says what Intervyu is, reused wherever a short description is needed. */
export const TAGLINE = "AI mock interviews for software engineers";

// Titles stay under ~60 characters and descriptions under ~160, so search results show them whole.
const HOME_TITLE = "Intervyu: AI Mock Interviews for Software Engineers";
const HOME_DESCRIPTION =
    "Practise real technical interviews out loud with an AI interviewer: live coding with hidden tests, system design on a whiteboard, and a scored report.";

export const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

const LOGO = `${SITE_URL}/icon-512.png`;

const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: LOGO, width: 512, height: 512 },
    description: `${SITE_NAME}: ${TAGLINE}.`,
};

const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: HOME_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` },
};

const webApplication = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: SITE_URL,
    description: HOME_DESCRIPTION,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Interview preparation",
    operatingSystem: "Any",
    browserRequirements: "A modern web browser and a microphone",
    inLanguage: "en",
    image: `${SITE_URL}/og.png`,
    publisher: { "@id": `${SITE_URL}/#organization` },
    featureList: [
        "Spoken mock interviews with an AI interviewer that follows up on your answers",
        "Questions built from a job description, resume and GitHub profile",
        `Coding problems with hidden tests in ${PRODUCT_STATS.languages.join(", ")}`,
        "Problem difficulty that adapts to how the last problem went",
        "A whiteboard for system design interviews",
        "Interview formats from a 20-minute screen to a full loop",
        "A scored report with evidence from your transcript and a prioritised study plan",
        "Mock interviews for each engineering role",
    ],
};

function faqPage(items: ReadonlyArray<{ q: string; a: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
    };
}

function breadcrumbs(trail: Array<{ name: string; path: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: abs(item.path) })),
    };
}

/** The role pages as an ordered list, so search engines see the collection and not just the index page. */
const roleList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Mock interviews by engineering role",
    numberOfItems: ROLE_CONTENT.length,
    itemListElement: ROLE_CONTENT.map((role, i) => ({ "@type": "ListItem", position: i + 1, name: `${role.role} mock interview`, url: abs(`/mock-interviews/${role.slug}`) })),
};

/** Questions and answers shown on a role page, also published as structured data. */
export function roleFaq(slug: string): Array<{ q: string; a: string }> {
    const role = ROLE_CONTENT.find((r) => r.slug === slug);
    if (!role) return [];
    return role.sampleQuestions.slice(0, 5).map((s) => ({ q: s.question, a: `A strong answer covers: ${s.lookFor.join("; ")}.` }));
}

export const PUBLIC_PATHS = ["/", "/mock-interviews", ...ROLE_CONTENT.map((r) => `/mock-interviews/${r.slug}`), "/privacy", "/terms"];

function article(word: string): "a" | "an" {
    return /^(?:SDE|[AEIOU])/.test(word) ? "an" : "a";
}

/** A search-result title for a role page: under ~60 characters where the role name allows. */
function roleTitle(role: string): string {
    const name = role.replace(/\s*\(.*\)$/, "");
    const full = `${name} Mock Interview Practice with AI | ${SITE_NAME}`;
    return full.length <= 62 ? full : `${name} Mock Interview Practice | ${SITE_NAME}`;
}

/** SEO for every route. Pure, so the browser and the build-time prerender always agree. */
export function seoFor(pathname: string): Seo {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

    if (path === "/") {
        return { title: HOME_TITLE, description: HOME_DESCRIPTION, canonical: "/", noindex: false, jsonLd: [organization, website, webApplication, faqPage(FAQ)] };
    }

    if (path === "/mock-interviews") {
        return {
            title: `AI Mock Interview Practice by Engineering Role | ${SITE_NAME}`,
            description: `AI mock interviews for ${ROLE_CONTENT.map((r) => r.role).slice(0, 3).join(", ")} and more: what each interview covers, with sample questions.`,
            canonical: "/mock-interviews",
            noindex: false,
            jsonLd: [breadcrumbs([{ name: "Home", path: "/" }, { name: "Mock interviews", path: "/mock-interviews" }]), roleList],
        };
    }

    const role = ROLE_CONTENT.find((r) => path === `/mock-interviews/${r.slug}`);
    if (role) {
        return {
            title: roleTitle(role.role),
            description: `Practise ${article(role.role)} ${role.role} interview out loud with an AI interviewer. Covers ${role.focusAreas[0]} and more, with live coding and a scored report.`,
            canonical: path,
            noindex: false,
            jsonLd: [
                breadcrumbs([{ name: "Home", path: "/" }, { name: "Mock interviews", path: "/mock-interviews" }, { name: role.role, path }]),
                faqPage(roleFaq(role.slug)),
            ],
        };
    }

    if (path === "/privacy") {
        return { title: `Privacy | ${SITE_NAME}`, description: `What ${SITE_NAME} collects, why, who processes it, how long it is kept and how to delete it.`, canonical: "/privacy", noindex: false, jsonLd: [] };
    }
    if (path === "/terms") {
        return { title: `Terms of use | ${SITE_NAME}`, description: `The terms for using ${SITE_NAME}, including what the practice feedback is and is not.`, canonical: "/terms", noindex: false, jsonLd: [] };
    }

    // Sign-in, the app itself and anything unknown: useful to people, useless in search results.
    return { title: SITE_NAME, description: HOME_DESCRIPTION, canonical: null, noindex: true, jsonLd: [] };
}

export function canonicalUrl(seo: Seo): string | null {
    return seo.canonical ? abs(seo.canonical) : null;
}

export { BEHAVIORAL_SAMPLES, FORMAT_CONTENT };
