import type { GithubProfile } from "./github";

/**
 * What the candidate's own material says about the work they do, read without a language model: which kinds of problem their
 * job description, resume and repositories point toward, and which programming language they are most at home in. It steers
 * which coding problems are chosen, and it is what still steers them when the model is unavailable.
 */
export interface Signals {
    /** How strongly the role and the candidate's work call for each problem topic (the tags of the problem bank). Higher is stronger. */
    tags: Record<string, number>;
    /** Plain-language names for what was detected, strongest first ("scheduling and calendars"). */
    themes: string[];
    /** The programming languages the candidate works in that the editor supports, most used first. */
    languages: EditorLanguage[];
}

export type EditorLanguage = "javascript" | "typescript" | "python" | "cpp" | "java";

interface Rule {
    pattern: RegExp;
    /** The problem topics this kind of work is about, with how much. */
    tags: Record<string, number>;
    theme: string;
}

const RULES: Rule[] = [
    { pattern: /\b(graphs?|network topolog\w*|dependency (?:graph|resolution)|dependency management|package manager|build system|workflow (?:engine|orchestrat\w*)|dags?|airflow|routing|route planning|shortest path|social network|knowledge graph|service mesh)\b/i, tags: { graph: 3, bfs: 2, dfs: 2, "topological-sort": 2 }, theme: "graphs and dependencies" },
    { pattern: /\b(cach(?:e|es|ing)|lru|redis|memcached|cdn|memoi[sz]ation|session store|key[- ]value)\b/i, tags: { "hash-map": 3, "hash-set": 1, design: 2 }, theme: "caching and lookups" },
    { pattern: /\b(rate limit\w*|throttl\w*|sliding window|streaming|real[- ]time|telemetry|time[- ]series|metrics|monitoring|alerting|observability|event stream|kafka|kinesis|pub ?sub)\b/i, tags: { "sliding-window": 3, heap: 1, "prefix-sum": 1, queue: 1, "hash-map": 1 }, theme: "streams and rate limits" },
    { pattern: /\b(search|autocomplete|typeahead|text processing|tokeni[sz]\w*|pars(?:e|er|ing)|nlp|natural language|logs?|log processing|regex|regular expressions?|string processing|elasticsearch|lucene|indexing)\b/i, tags: { string: 3, trie: 2, "hash-map": 1, "two-pointers": 1 }, theme: "text, search and parsing" },
    { pattern: /\b(schedul\w*|calendars?|booking|reservations?|appointments?|meetings?|timeline|intervals?|availability|shifts?|rostering|cron)\b/i, tags: { intervals: 3, sorting: 2, greedy: 1, heap: 1 }, theme: "scheduling and calendars" },
    { pattern: /\b(ranking|rankings|leaderboards?|recommend\w*|top[- ]k|priority queues?|job queues?|task queues?|worker pools?|load balanc\w*|queueing)\b/i, tags: { heap: 3, sorting: 1, "bucket-sort": 1, quickselect: 1 }, theme: "ranking and queues" },
    { pattern: /\b(databases?|sql|query (?:planner|optimi[sz]\w*)|b-?trees?|storage engines?|sharding|partition\w*|consistent hashing|replication|indexes|data ?stores?|postgres\w*|mysql|mongodb|dynamodb|cassandra)\b/i, tags: { "binary-search": 2, sorting: 2, "hash-map": 1, "two-pointers": 1 }, theme: "databases and indexing" },
    { pattern: /\b(payments?|ledgers?|transactions?|billing|invoic\w*|fintech|banking|reconcil\w*|idempoten\w*|accounting|pricing|checkout|orders?|inventory|e-?commerce|cart)\b/i, tags: { "hash-map": 2, "prefix-sum": 1, "dynamic-programming": 1, greedy: 1, sorting: 1 }, theme: "payments and transactions" },
    { pattern: /\b(data pipelines?|etl|elt|analytics|aggregat\w*|batch (?:jobs?|processing)|spark|hadoop|data warehouse|data lake|data engineering|big data|map ?reduce|dbt|snowflake|bigquery)\b/i, tags: { "hash-map": 2, sorting: 2, heap: 1, "two-pointers": 1, "prefix-sum": 1 }, theme: "data processing" },
    { pattern: /\b(react|vue|angular|svelte|frontend|front-end|front end|dom|css|html|web components?|ui components?|browser|next\.?js|redux|design systems?)\b/i, tags: { string: 2, stack: 2, array: 1, recursion: 1, "two-pointers": 1 }, theme: "front-end work" },
    { pattern: /\b(android|ios|swift|kotlin|react native|flutter|mobile apps?|offline[- ]first)\b/i, tags: { array: 1, string: 2, "hash-map": 2, stack: 1 }, theme: "mobile apps" },
    { pattern: /\b(devops|sre|site reliability|kubernetes|k8s|docker|terraform|ansible|ci ?\/ ?cd|infrastructure|incident|on-?call|cloud|aws|gcp|azure|helm|deployments?)\b/i, tags: { graph: 1, intervals: 1, "sliding-window": 1, heap: 1, string: 1 }, theme: "infrastructure and operations" },
    { pattern: /\b(security|authentication|authorization|oauth|crypto\w*|encryption|tokens?|jwt|sso|penetration|vulnerabilit\w*)\b/i, tags: { "hash-map": 2, string: 2, "bit-manipulation": 1 }, theme: "security" },
    { pattern: /\b(games?|gaming|simulation|grids?|maps?|geospatial|gps|location|robotics|pathfinding|image processing|computer vision|graphics)\b/i, tags: { matrix: 3, bfs: 2, dfs: 1, "dynamic-programming": 1 }, theme: "grids, maps and simulation" },
    { pattern: /\b(algorithms?|competitive programming|optimi[sz]ation|performance[- ]critical|high[- ]performance|low[- ]latency|complexity|data structures?)\b/i, tags: { "dynamic-programming": 2, greedy: 2, "binary-search": 1, heap: 1 }, theme: "algorithms and performance" },
    { pattern: /\b(embedded|firmware|kernel|drivers?|systems programming|low[- ]level|bit ?wise|compilers?|interpreters?|virtual machines?|assembly|rtos)\b/i, tags: { "bit-manipulation": 3, "two-pointers": 1, array: 1, stack: 1 }, theme: "low-level systems" },
    { pattern: /\b(compilers?|interpreters?|dsl|expression (?:evaluator|parser)|abstract syntax|lexer|syntax tree|calculators?)\b/i, tags: { stack: 3, string: 2, recursion: 1 }, theme: "parsing and evaluation" },
    { pattern: /\b(machine learning|ml|deep learning|data science|statistics|models?|feature engineering|pytorch|tensorflow|pandas|numpy|forecast\w*)\b/i, tags: { array: 1, "prefix-sum": 1, "dynamic-programming": 1, matrix: 1, sorting: 1 }, theme: "data and modelling" },
    { pattern: /\b(microservices?|distributed systems?|api|apis|rest|grpc|graphql|backend|back-end|back end|server-side|services?)\b/i, tags: { "hash-map": 1, array: 1, string: 1, graph: 1 }, theme: "backend services" },
];

/** Names in the wild for the languages the editor supports, and how they are written by GitHub and in job descriptions. */
const LANGUAGE_ALIASES: Array<[EditorLanguage, RegExp]> = [
    ["typescript", /\btypescript\b|\bts\b/i],
    ["javascript", /\bjavascript\b|\bnode(?:\.?js)?\b|\bjs\b/i],
    ["python", /\bpython\d?\b|\bdjango\b|\bflask\b|\bfastapi\b/i],
    ["java", /\bjava\b|\bkotlin\b|\bspring\b|\bscala\b/i],
    ["cpp", /\bc\+\+\b|\bcpp\b|\bc language\b|\bembedded c\b/i],
];

const GITHUB_LANGUAGE: Record<string, EditorLanguage> = {
    typescript: "typescript",
    javascript: "javascript",
    python: "python",
    java: "java",
    kotlin: "java",
    scala: "java",
    "c++": "cpp",
    c: "cpp",
    "jupyter notebook": "python",
};

export interface SignalInput {
    role: string;
    jobDescription?: string;
    resumeText?: string;
    github?: GithubProfile | null;
    /** Topics the model picked out of the job description. The strongest evidence, since it read the whole thing. */
    modelTags?: string[];
    /** Topics that matter for the role whatever the candidate's material says. */
    roleTags?: string[];
}

function bump(tags: Record<string, number>, add: Record<string, number>, factor = 1): void {
    for (const [tag, weight] of Object.entries(add)) tags[tag] = (tags[tag] ?? 0) + weight * factor;
}

/** Reads the candidate's job description, resume and repositories for the kinds of work they do. */
export function extractSignals(input: SignalInput): Signals {
    const tags: Record<string, number> = {};
    const themes: Array<{ theme: string; score: number }> = [];

    // The role itself is a weak, steady signal.
    (input.roleTags ?? []).forEach((tag, i) => bump(tags, { [tag]: Math.max(0.5, 1.5 - i * 0.25) }));

    // The model's reading of the job description is the strongest evidence, in the order it ranked the topics.
    (input.modelTags ?? []).forEach((tag, i) => bump(tags, { [tag]: Math.max(1.5, 4 - i * 0.5) }));

    const sources: Array<[string, number]> = [
        [input.jobDescription ?? "", 1],
        [input.resumeText ?? "", 0.7],
        [
            (input.github?.repos ?? []).map((repo) => [repo.name, repo.description, ...repo.topics, repo.readme?.slice(0, 600) ?? ""].join(" ")).join("\n"),
            0.6,
        ],
    ];
    for (const rule of RULES) {
        let score = 0;
        for (const [text, factor] of sources) {
            if (!text) continue;
            const hits = text.match(new RegExp(rule.pattern.source, "gi"))?.length ?? 0;
            // Mentioned once is a hint; mentioned again and again is what the job is about.
            if (hits > 0) score += factor * Math.min(3, 1 + Math.log2(hits));
        }
        if (score > 0) {
            bump(tags, rule.tags, Math.min(score, 3) / 3 * 1.4);
            themes.push({ theme: rule.theme, score });
        }
    }

    return {
        tags: Object.fromEntries(Object.entries(tags).map(([tag, weight]) => [tag, Math.round(weight * 100) / 100])),
        themes: themes.sort((a, b) => b.score - a.score).map((t) => t.theme).slice(0, 4),
        languages: detectLanguages(input),
    };
}

/** The supported languages the candidate works in, the ones they actually publish code in first. */
export function detectLanguages(input: Pick<SignalInput, "jobDescription" | "resumeText" | "github">): EditorLanguage[] {
    const score = new Map<EditorLanguage, number>();
    const add = (language: EditorLanguage | undefined, amount: number) => {
        if (language) score.set(language, (score.get(language) ?? 0) + amount);
    };

    // What they publish counts most: recent repositories first.
    (input.github?.repos ?? []).forEach((repo, index) => {
        if (repo.language) add(GITHUB_LANGUAGE[repo.language.toLowerCase()], 3 - Math.min(index, 4) * 0.4);
    });
    for (const [text, factor] of [[input.resumeText ?? "", 0.8], [input.jobDescription ?? "", 0.5]] as const) {
        for (const [language, alias] of LANGUAGE_ALIASES) {
            const hits = text.match(new RegExp(alias.source, "gi"))?.length ?? 0;
            if (hits > 0) add(language, factor * Math.min(2, 1 + Math.log2(hits)));
        }
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language);
}

/** A short phrase for why a problem was chosen, from the themes it matched. Empty when nothing in particular did. */
export function relevanceNote(problemTags: string[], signals: Signals | undefined): string {
    if (!signals || signals.themes.length === 0) return "";
    for (const rule of RULES) {
        if (!signals.themes.includes(rule.theme)) continue;
        if (problemTags.some((tag) => (rule.tags[tag] ?? 0) >= 2)) return rule.theme;
    }
    return "";
}
