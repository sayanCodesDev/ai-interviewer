import { FAQ } from "@/content/faq";
import { BEHAVIORAL_SAMPLES, FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "@/content/roles.generated";

export const SITE_NAME = "AI Interviewer";

/** The public origin, used for canonical URLs and the sitemap. Set VITE_SITE_URL for the deployed build. */
const configuredSiteUrl: string | undefined = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_SITE_URL : undefined;
export const SITE_URL: string = (configuredSiteUrl || "https://ai-interviewer.example.com").replace(/\/+$/, "");

export interface Seo {
    title: string;
    description: string;
    /** The canonical path, or null for pages that should not be indexed at all. */
    canonical: string | null;
    noindex: boolean;
    jsonLd: object[];
}

const HOME_TITLE = "AI Interviewer: practise technical interviews out loud, with a scored report";
const HOME_DESCRIPTION =
    "Take a realistic technical interview with an AI interviewer. Talk it through, solve coding problems in a live editor, and get a scored report with a transcript and a study plan.";

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

const organization = { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/favicon.svg` };
const website = { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL };

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

/** Questions and answers shown on a role page, also published as structured data. */
export function roleFaq(slug: string): Array<{ q: string; a: string }> {
    const role = ROLE_CONTENT.find((r) => r.slug === slug);
    if (!role) return [];
    return role.sampleQuestions.slice(0, 5).map((s) => ({ q: s.question, a: `A strong answer covers: ${s.lookFor.join("; ")}.` }));
}

export const PUBLIC_PATHS = ["/", "/mock-interviews", ...ROLE_CONTENT.map((r) => `/mock-interviews/${r.slug}`), "/privacy", "/terms"];

/** SEO for every route. Pure, so the browser and the build-time prerender always agree. */
export function seoFor(pathname: string): Seo {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

    if (path === "/") {
        return {
            title: HOME_TITLE,
            description: HOME_DESCRIPTION,
            canonical: "/",
            noindex: false,
            jsonLd: [
                organization,
                website,
                {
                    "@context": "https://schema.org",
                    "@type": "SoftwareApplication",
                    name: SITE_NAME,
                    applicationCategory: "EducationalApplication",
                    operatingSystem: "Any (web browser)",
                    description: HOME_DESCRIPTION,
                    url: SITE_URL,
                    featureList: [
                        "Voice interview with an AI interviewer",
                        `${PRODUCT_STATS.problems} coding problems with hidden tests in ${PRODUCT_STATS.languages.join(", ")}`,
                        "Questions tailored to a job description, resume and GitHub profile",
                        "Scored report with transcript and study plan",
                    ],
                },
                faqPage(FAQ),
            ],
        };
    }

    if (path === "/mock-interviews") {
        return {
            title: "AI mock interviews for every engineering role | AI Interviewer",
            description: `Practise a realistic technical interview for ${ROLE_CONTENT.map((r) => r.role).slice(0, 4).join(", ")} and more. See what each interview covers and the questions you'll be asked.`,
            canonical: "/mock-interviews",
            noindex: false,
            jsonLd: [breadcrumbs([{ name: "Home", path: "/" }, { name: "Mock interviews", path: "/mock-interviews" }])],
        };
    }

    const role = ROLE_CONTENT.find((r) => path === `/mock-interviews/${r.slug}`);
    if (role) {
        return {
            title: `${role.role} mock interview: practise with an AI interviewer | AI Interviewer`,
            description: `${role.summary} Practise real ${role.role} interview questions out loud, solve coding problems in a live editor and get a scored report.`.slice(0, 300),
            canonical: path,
            noindex: false,
            jsonLd: [
                breadcrumbs([{ name: "Home", path: "/" }, { name: "Mock interviews", path: "/mock-interviews" }, { name: role.role, path }]),
                faqPage(roleFaq(role.slug)),
            ],
        };
    }

    if (path === "/privacy") {
        return { title: "Privacy | AI Interviewer", description: "What AI Interviewer collects, why, who processes it, how long it is kept and how to delete it.", canonical: "/privacy", noindex: false, jsonLd: [] };
    }
    if (path === "/terms") {
        return { title: "Terms of use | AI Interviewer", description: "The terms for using AI Interviewer, including what the practice feedback is and is not.", canonical: "/terms", noindex: false, jsonLd: [] };
    }

    // Sign-in, the app itself and anything unknown: useful to people, useless in search results.
    return { title: SITE_NAME, description: HOME_DESCRIPTION, canonical: null, noindex: true, jsonLd: [] };
}

export function canonicalUrl(seo: Seo): string | null {
    return seo.canonical ? abs(seo.canonical) : null;
}

export { BEHAVIORAL_SAMPLES, FORMAT_CONTENT };
