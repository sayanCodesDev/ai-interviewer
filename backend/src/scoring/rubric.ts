import type { RoundType } from "../interview/plan";

export type DimensionKey =
    | "problem_solving" | "correctness" | "code_quality" | "complexity"
    | "technical_depth" | "system_design" | "communication" | "behavioral";

export interface Dimension {
    key: DimensionKey;
    label: string;
    weight: number;
    /** Which rounds must have happened for this to be assessable. "any" means always. */
    needs: Array<RoundType | "any">;
    /** Scored by the tests, not by the model. */
    objective?: boolean;
    description: string;
}

export const DIMENSIONS: Dimension[] = [
    { key: "problem_solving", label: "Problem solving", weight: 20, needs: ["coding"], description: "Breaks problems down, chooses sound approaches, handles edge cases and adapts after feedback." },
    { key: "correctness", label: "Code correctness", weight: 15, needs: ["coding"], objective: true, description: "Whether submitted solutions pass the tests, and how many attempts and hints it took." },
    { key: "code_quality", label: "Code quality", weight: 10, needs: ["coding"], description: "Readability, naming, structure, idiomatic use of the language and handling of edge cases." },
    { key: "complexity", label: "Complexity analysis", weight: 10, needs: ["coding"], description: "States and justifies time and space complexity correctly and reasons about optimisations." },
    { key: "technical_depth", label: "Technical depth", weight: 20, needs: ["technical", "background"], description: "Accuracy and depth of role-specific knowledge, awareness of trade-offs, real-world experience." },
    { key: "system_design", label: "System design", weight: 15, needs: ["system_design"], description: "Clarifies requirements, proposes a sound architecture, and covers scaling, failure and trade-offs." },
    { key: "communication", label: "Communication", weight: 15, needs: ["any"], description: "Clear, structured and concise; thinks aloud; listens and answers the question that was asked." },
    { key: "behavioral", label: "Behavioral and ownership", weight: 10, needs: ["behavioral"], description: "Concrete examples, ownership, collaboration and reflection." },
];

/** The dimensions that can be assessed given which parts of the interview actually took place. */
export function applicableDimensions(roundTypes: RoundType[]): Dimension[] {
    const held = new Set(roundTypes);
    return DIMENSIONS.filter((d) => d.needs.includes("any") || d.needs.some((need) => need !== "any" && held.has(need)));
}

export type Band = "Interview-ready" | "Close" | "Developing" | "Early stage";

export function bandFor(score: number): Band {
    if (score >= 85) return "Interview-ready";
    if (score >= 70) return "Close";
    if (score >= 50) return "Developing";
    return "Early stage";
}

/**
 * The overall score is computed here, never by the model: a weighted average of the dimensions that
 * could be assessed, out of 100. A dimension with no score simply doesn't count, and the remaining
 * weights are renormalised so skipping a round never lowers the score.
 */
export function overallScore(scores: Partial<Record<DimensionKey, number | null>>, dimensions: Dimension[]): number {
    let weighted = 0;
    let total = 0;
    for (const d of dimensions) {
        const score = scores[d.key];
        if (score === null || score === undefined) continue;
        weighted += d.weight * Math.max(0, Math.min(10, score));
        total += d.weight;
    }
    return total === 0 ? 0 : Math.round((weighted / total) * 10);
}

/** Hand-picked, long-lived references. The model chooses topics (tags); it can never invent a link. */
export const RESOURCES: Record<string, Array<{ title: string; url: string }>> = {
    algorithms: [
        { title: "NeetCode roadmap", url: "https://neetcode.io/roadmap" },
        { title: "Big-O cheat sheet", url: "https://www.bigocheatsheet.com/" },
        { title: "MIT 6.006 Introduction to Algorithms", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/" },
    ],
    "system-design": [
        { title: "System Design Primer", url: "https://github.com/donnemartin/system-design-primer" },
        { title: "roadmap.sh: System design", url: "https://roadmap.sh/system-design" },
    ],
    behavioral: [{ title: "Tech Interview Handbook: behavioral interviews", url: "https://www.techinterviewhandbook.org/behavioral-interview/" }],
    communication: [{ title: "Tech Interview Handbook: coding interview prep", url: "https://www.techinterviewhandbook.org/coding-interview-prep/" }],
    javascript: [{ title: "The Modern JavaScript Tutorial", url: "https://javascript.info/" }, { title: "MDN Web Docs", url: "https://developer.mozilla.org/" }],
    react: [{ title: "React documentation: Learn", url: "https://react.dev/learn" }],
    frontend: [{ title: "web.dev Learn", url: "https://web.dev/learn/" }, { title: "roadmap.sh: Frontend", url: "https://roadmap.sh/frontend" }],
    accessibility: [{ title: "WAI-ARIA Authoring Practices", url: "https://www.w3.org/WAI/ARIA/apg/" }],
    performance: [{ title: "web.dev: Core Web Vitals", url: "https://web.dev/articles/vitals" }],
    backend: [{ title: "roadmap.sh: Backend", url: "https://roadmap.sh/backend" }],
    databases: [{ title: "Use The Index, Luke", url: "https://use-the-index-luke.com/" }, { title: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/current/" }],
    devops: [{ title: "roadmap.sh: DevOps", url: "https://roadmap.sh/devops" }],
    sre: [{ title: "Google SRE Book", url: "https://sre.google/sre-book/table-of-contents/" }],
    kubernetes: [{ title: "Kubernetes tutorials", url: "https://kubernetes.io/docs/tutorials/" }],
    terraform: [{ title: "Terraform tutorials", url: "https://developer.hashicorp.com/terraform/tutorials" }],
    data: [{ title: "Data Engineering Zoomcamp", url: "https://github.com/DataTalksClub/data-engineering-zoomcamp" }, { title: "dbt documentation", url: "https://docs.getdbt.com/" }],
    spark: [{ title: "Apache Spark documentation", url: "https://spark.apache.org/docs/latest/" }],
    kafka: [{ title: "Apache Kafka documentation", url: "https://kafka.apache.org/documentation/" }],
    mobile: [{ title: "React Native documentation", url: "https://reactnative.dev/docs/getting-started" }, { title: "Flutter documentation", url: "https://docs.flutter.dev/" }],
};

export const RESOURCE_TAGS = Object.keys(RESOURCES);

export function resourcesFor(tags: string[]): Array<{ title: string; url: string }> {
    const seen = new Set<string>();
    const out: Array<{ title: string; url: string }> = [];
    for (const tag of tags) {
        for (const resource of RESOURCES[tag.toLowerCase()] ?? []) {
            if (!seen.has(resource.url)) { seen.add(resource.url); out.push(resource); }
        }
    }
    return out.slice(0, 4);
}
