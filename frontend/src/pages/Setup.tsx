import { ArrowRight, Check, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/usePageTitle";
import { AppLayout } from "@/layouts/AppLayout";
import { apiErrorMessage, apiFieldErrors } from "@/lib/api";
import { createInterview, fetchOptions } from "@/lib/interviews";
import type { Format, InterviewOptions, Level } from "@/lib/types";
import { cn } from "@/lib/utils";

// Shown until the options load, and used if that request fails, so the form is never empty.
const FALLBACK: InterviewOptions = {
    roles: ["Full Stack Developer", "Frontend Engineer", "Backend Engineer", "DevOps / SRE Engineer", "Data Engineer", "Mobile App Developer (React Native/Flutter)", "System Architect / Tech Lead"],
    levels: ["intern", "junior", "mid", "senior", "staff"],
    formats: [
        { id: "quick", label: "Quick screen", minutes: 20, description: "A short phone-screen: introductions, your background and one coding problem." },
        { id: "standard", label: "Standard loop", minutes: 45, description: "Background, two coding problems, technical questions from the job description, and behavioral." },
        { id: "full", label: "Full loop", minutes: 75, description: "The standard loop plus a third coding problem and a system-design round." },
        { id: "drill", label: "Coding drill", minutes: 30, description: "Only data structures and algorithms: four problems back to back." },
    ],
    voices: [{ id: "aura-2-thalia-en", name: "Thalia", description: "Clear and confident" }],
    accents: [{ id: "en", label: "English (general)" }],
};

const LEVEL_LABEL: Record<Level, string> = { intern: "Intern", junior: "Junior", mid: "Mid-level", senior: "Senior", staff: "Staff+" };

/** What each format contains, in order. Mirrors the interview engine's presets. */
const FORMAT_ROUNDS: Record<Format, Array<{ title: string; minutes: number; note?: string }>> = {
    quick: [{ title: "Introduction", minutes: 2 }, { title: "Background and projects", minutes: 3 }, { title: "Coding", minutes: 12, note: "1 problem" }, { title: "Wrap-up", minutes: 3 }],
    standard: [{ title: "Introduction", minutes: 3 }, { title: "Background and projects", minutes: 6 }, { title: "Coding", minutes: 18, note: "2 problems" }, { title: "Technical deep-dive", minutes: 9 }, { title: "Behavioral", minutes: 6 }, { title: "Wrap-up", minutes: 3 }],
    full: [{ title: "Introduction", minutes: 3 }, { title: "Background and projects", minutes: 7 }, { title: "Coding", minutes: 27, note: "3 problems" }, { title: "Technical deep-dive", minutes: 14 }, { title: "System design", minutes: 14, note: "mid-level and up" }, { title: "Behavioral", minutes: 6 }, { title: "Wrap-up", minutes: 4 }],
    drill: [{ title: "Introduction", minutes: 1 }, { title: "Coding", minutes: 26, note: "4 problems" }, { title: "Wrap-up", minutes: 3 }],
};

const CHECKLIST = ["Find somewhere quiet", "Headphones help the interviewer hear only you", "Allow the microphone when your browser asks"];

// A bare username or any github.com link; the server validates again.
const GITHUB_PROFILE = /^(https?:\/\/)?(www\.)?(github\.com\/)?[A-Za-z0-9][A-Za-z0-9-]*\/?$/i;
const MAX_JD = 6000;
/** Mirrors the server: anything shorter cannot say what a role needs. */
const MIN_JD = 60;
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

function RadioCard({ name, value, checked, onChange, title, meta, description }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; meta?: string; description?: string }) {
    return (
        <label
            className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-foreground/10 hover:border-foreground/40",
                checked && "border-foreground bg-accent/50",
            )}
        >
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
            <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{title}</span>
                {meta && <span className="font-mono text-xs text-muted-foreground">{meta}</span>}
            </span>
            {description && <span className="text-[13px] leading-snug text-muted-foreground">{description}</span>}
        </label>
    );
}

export function Setup() {
    usePageTitle("Set up your interview");
    const navigate = useNavigate();
    const fileInput = useRef<HTMLInputElement>(null);

    const [options, setOptions] = useState<InterviewOptions>(FALLBACK);
    const [role, setRole] = useState(FALLBACK.roles[0]!);
    const [level, setLevel] = useState<Level>("mid");
    const [format, setFormat] = useState<Format>("standard");
    const [jobDescription, setJobDescription] = useState("");
    const [githubUrl, setGithubUrl] = useState("");
    const [resume, setResume] = useState<File | null>(null);
    const [voice, setVoice] = useState(FALLBACK.voices[0]!.id);
    const [accent, setAccent] = useState("en");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchOptions()
            .then((loaded) => {
                setOptions(loaded);
                setRole((current) => (loaded.roles.includes(current) ? current : loaded.roles[0]!));
                setVoice((current) => (loaded.voices.some((v) => v.id === current) ? current : loaded.voices[0]!.id));
            })
            .catch(() => undefined);
    }, []);

    function chooseResume(file: File | null) {
        if (file && file.size > MAX_RESUME_BYTES) {
            setErrors((current) => ({ ...current, resume: "That file is larger than 2 MB." }));
            return;
        }
        setErrors((current) => {
            const { resume: _resume, ...rest } = current;
            return rest;
        });
        setResume(file);
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        const next: Record<string, string> = {};
        const trimmed = githubUrl.trim();
        const jd = jobDescription.trim();
        if (!trimmed) next.githubUrl = "Add your GitHub profile: the interviewer asks about your real projects.";
        else if (!GITHUB_PROFILE.test(trimmed)) next.githubUrl = "Use your profile link, like https://github.com/your-username.";
        if (!jd) next.jobDescription = "Paste the job description: the interview is built from it.";
        else if (jd.length < MIN_JD) next.jobDescription = `That is too short to be a job description. Paste the whole thing (at least ${MIN_JD} characters) so the questions fit the role.`;
        else if (jobDescription.length > MAX_JD) next.jobDescription = `The job description is limited to ${MAX_JD.toLocaleString()} characters.`;
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const form = new FormData();
        form.set("role", role);
        form.set("level", level);
        form.set("format", format);
        form.set("voice", voice);
        form.set("accent", accent);
        form.set("jobDescription", jd);
        form.set("githubUrl", trimmed);
        if (resume) form.set("resume", resume);

        setLoading(true);
        try {
            const { id } = await createInterview(form);
            navigate(`/lobby/${id}`);
        } catch (error) {
            const fields = apiFieldErrors(error);
            if (Object.keys(fields).length > 0) setErrors(fields);
            toast.error(apiErrorMessage(error, "We couldn't set up your interview. Please try again."));
        } finally {
            setLoading(false);
        }
    }

    const schedule = FORMAT_ROUNDS[format];
    const selectedFormat = options.formats.find((f) => f.id === format);
    const seniorEnough = level === "mid" || level === "senior" || level === "staff";

    return (
        <AppLayout>
            <div className="app-container grid gap-14 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20 lg:py-16">
                <section>
                    <p className="label-mono text-muted-foreground">Interview setup</p>
                    <h1 className="text-h2 mt-4">Set up your interview.</h1>
                    <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                        Tell us the role and paste the job description. The interviewer builds its questions from it, like a real loop.
                    </p>

                    <form onSubmit={handleSubmit} noValidate className="mt-10 grid max-w-xl gap-8">
                        <div className="grid gap-6 sm:grid-cols-2">
                            <Field label="Target role" htmlFor="role" error={errors.role}>
                                {(control) => (
                                    <Select value={role} onValueChange={setRole}>
                                        <SelectTrigger {...control}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.roles.map((r) => (
                                                <SelectItem key={r} value={r}>
                                                    {r}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </Field>

                            <fieldset className="grid gap-2">
                                <legend className="text-sm font-medium">Your level</legend>
                                <div role="radiogroup" className="flex flex-wrap gap-1.5">
                                    {options.levels.map((l) => (
                                        <label
                                            key={l}
                                            className={cn(
                                                "cursor-pointer rounded-full border px-3 py-1.5 text-[13px] transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-foreground/10 hover:border-foreground/40",
                                                level === l ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground",
                                            )}
                                        >
                                            <input type="radio" name="level" value={l} checked={level === l} onChange={() => setLevel(l)} className="sr-only" />
                                            {LEVEL_LABEL[l]}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </div>

                        <fieldset className="grid gap-2.5">
                            <legend className="text-sm font-medium">Format</legend>
                            <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
                                {options.formats.map((f) => (
                                    <RadioCard key={f.id} name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} title={f.label} meta={`${f.minutes} min`} description={f.description} />
                                ))}
                            </div>
                        </fieldset>

                        <Field
                            label="Job description"
                            htmlFor="jd"
                            error={errors.jobDescription}
                            hint={`Required. The coding problems, technical questions and follow-ups are chosen from it. ${jobDescription.length.toLocaleString()} / ${MAX_JD.toLocaleString()}`}
                        >
                            {(control) => (
                                <Textarea
                                    {...control}
                                    name="jobDescription"
                                    rows={6}
                                    required
                                    placeholder="Paste the role's description, requirements and responsibilities…"
                                    value={jobDescription}
                                    onChange={(event) => {
                                        setJobDescription(event.target.value);
                                        if (errors.jobDescription) setErrors((c) => { const { jobDescription: _j, ...rest } = c; return rest; });
                                    }}
                                />
                            )}
                        </Field>

                        <div className="grid gap-6 sm:grid-cols-2">
                            <Field label="Resume (optional)" htmlFor="resume" error={errors.resume} hint="PDF or plain text, up to 2 MB. Used only to tailor your questions; you can delete it any time.">
                                {(control) => (
                                    <div>
                                        <input
                                            {...control}
                                            ref={fileInput}
                                            type="file"
                                            accept=".pdf,.txt,.md,application/pdf,text/plain"
                                            className="sr-only"
                                            onChange={(event) => chooseResume(event.target.files?.[0] ?? null)}
                                        />
                                        {resume ? (
                                            <div className="flex h-11 items-center gap-2 rounded-md border bg-card pr-1.5 pl-3 text-sm">
                                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate">{resume.name}</span>
                                                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove resume" onClick={() => { chooseResume(null); if (fileInput.current) fileInput.current.value = ""; }}>
                                                    <X />
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button type="button" variant="outline" size="lg" className="w-full justify-start font-normal text-muted-foreground" onClick={() => fileInput.current?.click()}>
                                                <FileText />
                                                Choose a file
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </Field>

                            <Field label="GitHub profile" htmlFor="github" error={errors.githubUrl} hint="Required. We read your public repositories to ask about real projects.">
                                {(control) => (
                                    <Input
                                        {...control}
                                        type="text"
                                        name="github"
                                        inputMode="url"
                                        required
                                        autoComplete="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        placeholder="https://github.com/your-username"
                                        value={githubUrl}
                                        onChange={(event) => {
                                            setGithubUrl(event.target.value);
                                            if (errors.githubUrl) setErrors((c) => { const { githubUrl: _g, ...rest } = c; return rest; });
                                        }}
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                            <Field label="Interviewer voice" htmlFor="voice">
                                {(control) => (
                                    <Select value={voice} onValueChange={setVoice}>
                                        <SelectTrigger {...control}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.voices.map((v) => (
                                                <SelectItem key={v.id} value={v.id}>
                                                    {v.name} · {v.description}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </Field>
                            <Field label="Your accent" htmlFor="accent" hint="Helps us understand you accurately.">
                                {(control) => (
                                    <Select value={accent} onValueChange={setAccent}>
                                        <SelectTrigger {...control}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.accents.map((a) => (
                                                <SelectItem key={a.id} value={a.id}>
                                                    {a.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </Field>
                        </div>

                        <Button type="submit" variant="signal" size="lg" disabled={loading} className="group w-full sm:w-fit">
                            {loading ? <Spinner /> : null}
                            {loading ? "Setting up…" : "Continue"}
                            {!loading && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                        </Button>
                    </form>
                </section>

                <aside className="grid content-start gap-10">
                    <div className="rounded-xl border bg-card p-7">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="label-mono text-muted-foreground">Your interview</p>
                            <p className="font-mono text-xs text-muted-foreground">{selectedFormat?.minutes ?? 45} min</p>
                        </div>
                        <ol className="mt-6 grid gap-5">
                            {schedule.map((step, index) => {
                                const skipped = step.title === "System design" && !seniorEnough;
                                return (
                                    <li key={step.title} className={cn("grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-3", skipped && "opacity-45")}>
                                        <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                        <div>
                                            <h2 className="text-[15px] font-medium">{skipped ? "Concepts and trade-offs" : step.title}</h2>
                                            {step.note && !skipped && <p className="mt-0.5 text-[13px] text-muted-foreground">{step.note}</p>}
                                            {skipped && <p className="mt-0.5 text-[13px] text-muted-foreground">System design starts at mid-level.</p>}
                                        </div>
                                        <span className="font-mono text-xs text-muted-foreground">{step.minutes} min</span>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="mt-6 border-t pt-5 text-[13px] leading-relaxed text-muted-foreground">
                            When it ends you get a scored report with a transcript, feedback on every part, and a plan for what to practise next.
                        </p>
                    </div>

                    <div>
                        <p className="label-mono text-muted-foreground">Before you begin</p>
                        <ul className="mt-5 grid gap-3">
                            {CHECKLIST.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-signal text-signal-foreground">
                                        <Check className="size-3" strokeWidth={3} />
                                    </span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>
            </div>
        </AppLayout>
    );
}
