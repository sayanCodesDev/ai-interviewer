import "../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { GithubProfile } from "./github";
import { detectLanguages, extractSignals, relevanceNote } from "./signals";

const repo = (name: string, language: string | null, description = "", topics: string[] = []) => ({ name, description, language, topics, stars: 0 });
const profile = (...repos: ReturnType<typeof repo>[]): GithubProfile => ({ username: "sam", repos });

describe("reading the candidate's material for what the work is about", () => {
    test("a job description about scheduling points to interval problems, and says why", () => {
        const signals = extractSignals({
            role: "Backend Engineer",
            jobDescription: "You will own our booking and scheduling service: calendars, availability, appointment reminders and time-slot conflicts for thousands of clinics.",
        });
        assert.ok((signals.tags.intervals ?? 0) > 2, JSON.stringify(signals.tags));
        assert.ok((signals.tags.intervals ?? 0) > (signals.tags.graph ?? 0));
        assert.equal(signals.themes[0], "scheduling and calendars");
        assert.equal(relevanceNote(["array", "sorting", "intervals"], signals), "scheduling and calendars");
        assert.equal(relevanceNote(["string"], signals), "", "a problem about something else gets no reason");
    });

    test("a job description about dependencies and pipelines points to graph problems", () => {
        const signals = extractSignals({ role: "Data Engineer", jobDescription: "Build data pipelines on Airflow. Model workflows as DAGs, resolve task dependencies and keep the dependency graph healthy." });
        assert.ok((signals.tags["topological-sort"] ?? 0) > 1);
        assert.ok((signals.tags.graph ?? 0) > (signals.tags.string ?? 0));
    });

    test("the model's reading of the job description counts for the most", () => {
        const withModel = extractSignals({ role: "Backend Engineer", jobDescription: "Backend services.", modelTags: ["dynamic-programming", "heap"] });
        assert.ok((withModel.tags["dynamic-programming"] ?? 0) >= 3.5);
        assert.ok((withModel.tags.heap ?? 0) >= 3);
        const without = extractSignals({ role: "Backend Engineer", jobDescription: "Backend services." });
        assert.ok((without.tags["dynamic-programming"] ?? 0) < 1);
    });

    test("repositories and the resume count too, but less than the job description", () => {
        const fromRepo = extractSignals({ role: "Backend Engineer", github: profile(repo("route-planner", "Python", "Shortest path routing on a road network graph")) });
        assert.ok((fromRepo.tags.graph ?? 0) > 0.5);
        const fromJd = extractSignals({ role: "Backend Engineer", jobDescription: "Shortest path routing on a road network graph" });
        assert.ok((fromJd.tags.graph ?? 0) > (fromRepo.tags.graph ?? 0));
    });

    test("nothing to go on gives only the role's own topics, never nothing at all", () => {
        const signals = extractSignals({ role: "Backend Engineer", roleTags: ["hash-map", "array"] });
        assert.deepEqual(Object.keys(signals.tags).sort(), ["array", "hash-map"]);
        assert.deepEqual(signals.themes, []);
        assert.deepEqual(signals.languages, []);
    });
});

describe("the language the candidate works in", () => {
    test("what they publish counts most, most recent first", () => {
        const languages = detectLanguages({ github: profile(repo("a", "Python"), repo("b", "Python"), repo("c", "TypeScript")), jobDescription: "We use Java." });
        assert.equal(languages[0], "python");
        assert.ok(languages.includes("typescript") && languages.includes("java"));
    });

    test("languages the editor cannot run are ignored, and the resume and job description fill in", () => {
        assert.deepEqual(detectLanguages({ github: profile(repo("a", "Go"), repo("b", "Rust")) }), []);
        assert.equal(detectLanguages({ resumeText: "Six years of Python and Django, some C++.", github: profile(repo("a", "Go")) })[0], "python");
    });

    test("Kotlin and Scala map to Java, C to C++, and JavaScript is not mistaken for Java", () => {
        assert.deepEqual(detectLanguages({ github: profile(repo("a", "Kotlin")) }), ["java"]);
        assert.deepEqual(detectLanguages({ github: profile(repo("a", "C")) }), ["cpp"]);
        assert.deepEqual(detectLanguages({ resumeText: "Wrote JavaScript for years." }), ["javascript"]);
    });
});
