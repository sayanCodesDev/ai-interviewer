import { formatOffset } from "@/lib/format";
import type { ReportResponse } from "@/lib/types";

function fence(code: string, language: string): string {
    return `\`\`\`${language}\n${code.replace(/```/g, "'''")}\n\`\`\``;
}

/** The whole report and transcript as Markdown, for saving or pasting into notes. */
export function buildMarkdown(data: ReportResponse): string {
    const { interview, report, transcript } = data;
    const lines: string[] = [];
    const when = interview.endedAt ? new Date(interview.endedAt).toLocaleString() : "";

    lines.push(`# Interview report: ${interview.role}`, "", `${interview.level} level · ${interview.format} format${when ? ` · ${when}` : ""}`, "");

    if (report) {
        lines.push(`## Overall: ${report.overall.score}/100 (${report.overall.band})`, "", report.overall.headline, "", report.summary, "");

        lines.push("## Scores", "");
        for (const d of report.dimensions) {
            lines.push(`- **${d.label}**: ${d.score === null ? "not assessed" : `${d.score}/10`}${d.objective ? " (from tests)" : ""}${d.summary ? ` — ${d.summary}` : ""}`);
        }
        lines.push("");

        if (report.problems.length > 0) {
            lines.push("## Coding problems", "");
            for (const p of report.problems) {
                lines.push(`### ${p.title} (${p.difficulty})`, "", `${p.passed}/${p.total} tests passed · ${p.attempts} submission${p.attempts === 1 ? "" : "s"} · ${p.hintsUsed} hint${p.hintsUsed === 1 ? "" : "s"}`, "");
                if (p.feedback) lines.push(p.feedback, "");
                if (p.complexity.stated) lines.push(`Complexity you stated: ${p.complexity.stated} (${p.complexity.verdict.replace("_", " ")}). Intended: time ${p.intendedComplexity.time}, space ${p.intendedComplexity.space}.`, "");
                if (p.code) lines.push(fence(p.code, p.language), "");
            }
        }

        lines.push("## Where your effort showed", "");
        for (const s of report.strengths) lines.push(`- **${s.title}**: ${s.detail}`);
        lines.push("", "## What to work on", "");
        for (const s of report.improvements) lines.push(`- **${s.title}**: ${s.detail}`);

        lines.push("", "## Study plan", "");
        for (const s of report.studyPlan) {
            lines.push(`### ${s.topic} (${s.priority} priority)`, "", s.why, "");
            for (const a of s.actions) lines.push(`- [ ] ${a}`);
            for (const r of s.resources) lines.push(`- ${r.title}: ${r.url}`);
            lines.push("");
        }
        lines.push(`> ${report.disclaimer}`, "");
    }

    lines.push("## Transcript", "");
    for (const t of transcript) {
        if (t.role === "system") lines.push("", `**${t.text}**`, "");
        else lines.push(`**${formatOffset(t.offsetMs)} ${t.role === "candidate" ? "You" : "Interviewer"}:** ${t.text}${t.interrupted ? " _(cut off)_" : ""}`, "");
    }
    return lines.join("\n");
}

/** A plain-text transcript for copying. */
export function buildTranscriptText(data: ReportResponse): string {
    return data.transcript
        .map((t) => (t.role === "system" ? `\n--- ${t.text} ---` : `[${formatOffset(t.offsetMs)}] ${t.role === "candidate" ? "You" : "Interviewer"}: ${t.text}`))
        .join("\n");
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
