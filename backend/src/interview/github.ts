import { config } from "../config/env";
import { logger } from "../observability/logger";
import { sanitizeUntrusted } from "./untrusted";

/** GitHub usernames: alphanumeric or single hyphens, not starting or ending with one, at most 39 characters. */
export const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Accepts a bare username or any github.com profile or repository link, and returns just the
 * username, or null if it isn't one. The result goes into an outbound URL, so it must be strict.
 */
export function parseGithubInput(input: string | undefined | null): string | null {
    const trimmed = input?.trim();
    if (!trimmed) return null;

    let candidate = trimmed;
    const link = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i);
    if (link) candidate = link[1]!;
    else if (/[/:\s]/.test(trimmed)) return null;

    return GITHUB_USERNAME.test(candidate) ? candidate : null;
}

export interface GithubRepo {
    name: string;
    description: string;
    language: string | null;
    topics: string[];
    stars: number;
    readme?: string;
}

export interface GithubProfile {
    username: string;
    repos: GithubRepo[];
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: GithubProfile | null }>();
const verified = new Map<string, number>();

let doFetch: typeof fetch = (...args) => fetch(...args);

/** Tests replace the network with a fake, so no test ever reaches GitHub. Pass null to restore it. */
export function setGithubFetchForTesting(replacement: typeof fetch | null): void {
    doFetch = replacement ?? ((...args) => fetch(...args));
    cache.clear();
    verified.clear();
}

export type GithubCheck = "found" | "missing" | "unknown";

/**
 * Whether a GitHub account with this name exists. "unknown" means GitHub could not be asked (rate limit, outage): the
 * caller must not turn that into "no such user", or a candidate could not start an interview while GitHub is down.
 */
export async function verifyGithubUser(username: string): Promise<GithubCheck> {
    if (!GITHUB_USERNAME.test(username)) return "missing";
    const seen = verified.get(username.toLowerCase());
    if (seen && Date.now() - seen < 10 * 60 * 1000) return "found";
    try {
        const response = await doFetch(`https://api.github.com/users/${username}`, { headers: headers(), signal: AbortSignal.timeout(6_000) });
        if (response.status === 404) return "missing";
        if (!response.ok) return "unknown";
        verified.set(username.toLowerCase(), Date.now());
        return "found";
    } catch (error) {
        logger.warn({ err: error, username }, "Could not check the GitHub account");
        return "unknown";
    }
}

function headers(accept = "application/vnd.github+json"): Record<string, string> {
    return {
        Accept: accept,
        "User-Agent": "ai-interviewer",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}),
    };
}

async function getJson(url: string): Promise<unknown | null> {
    const response = await doFetch(url, { headers: headers(), signal: AbortSignal.timeout(8_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response.json();
}

async function getReadme(username: string, repo: string): Promise<string | undefined> {
    try {
        const response = await doFetch(`https://api.github.com/repos/${username}/${encodeURIComponent(repo)}/readme`, {
            headers: headers("application/vnd.github.raw+json"),
            signal: AbortSignal.timeout(6_000),
        });
        if (!response.ok) return undefined;
        return sanitizeUntrusted((await response.text()).slice(0, 4_000), 1_200);
    } catch {
        return undefined;
    }
}

/**
 * Reads a candidate's most recent public, non-fork repositories through GitHub's official API:
 * names, descriptions, languages, topics and the start of each README. Results are cached for an hour
 * so repeated interviews don't burn the rate limit. Never throws: a missing profile just means the
 * interview isn't tailored to it.
 */
export async function fetchGithubProfile(username: string): Promise<GithubProfile | null> {
    if (!GITHUB_USERNAME.test(username)) return null;

    const cached = cache.get(username.toLowerCase());
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    let profile: GithubProfile | null = null;
    try {
        const list = await getJson(`https://api.github.com/users/${username}/repos?sort=pushed&per_page=12&type=owner`);
        if (Array.isArray(list)) {
            const repos: GithubRepo[] = list
                .filter((r: any) => r && !r.fork && !r.archived && typeof r.name === "string")
                .slice(0, 6)
                .map((r: any) => ({
                    name: r.name,
                    description: sanitizeUntrusted(String(r.description ?? ""), 200),
                    language: typeof r.language === "string" ? r.language : null,
                    topics: Array.isArray(r.topics) ? r.topics.filter((t: unknown) => typeof t === "string").slice(0, 6) : [],
                    stars: Number(r.stargazers_count) || 0,
                }));
            await Promise.all(repos.slice(0, 3).map(async (repo) => { repo.readme = await getReadme(username, repo.name); }));
            profile = { username, repos };
        }
    } catch (error) {
        logger.warn({ err: error, username }, "Could not read the GitHub profile");
        return null; // don't cache failures: a rate limit clears
    }

    cache.set(username.toLowerCase(), { at: Date.now(), value: profile });
    return profile;
}

/** A compact, prompt-friendly summary of a profile. */
export function summariseGithub(profile: GithubProfile | null): string {
    if (!profile || profile.repos.length === 0) return "";
    return profile.repos
        .map((repo) => {
            const bits = [repo.language, ...repo.topics].filter(Boolean).join(", ");
            return `- ${repo.name}${bits ? ` (${bits})` : ""}${repo.description ? `: ${repo.description}` : ""}${repo.readme ? `\n  README: ${repo.readme.slice(0, 500)}` : ""}`;
        })
        .join("\n")
        .slice(0, 3_500);
}
