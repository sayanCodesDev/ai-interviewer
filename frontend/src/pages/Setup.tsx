import axios from "axios";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AppLayout } from "@/layouts/AppLayout";
import { BACKEND_URL } from "@/lib/config";
import { resetInterviewSession } from "@/lib/session";
import { usePageTitle } from "@/hooks/usePageTitle";

const ROLES = [
    "Full Stack Developer",
    "Frontend Engineer",
    "Backend Engineer",
    "DevOps / SRE Engineer",
    "Data Engineer",
    "Mobile App Developer (React Native/Flutter)",
    "System Architect / Tech Lead",
];

// The backend reads the last path segment as the username, so a profile URL or a bare username both work.
const GITHUB_PROFILE = /^(https?:\/\/)?(www\.)?(github\.com\/)?[A-Za-z0-9][A-Za-z0-9-]*\/?$/i;

const STEPS = [
    { title: "A quick hello", text: "The interviewer introduces itself and asks about your background." },
    { title: "Coding problems", text: "A code editor opens for each data structures and algorithms problem. Run your code, then submit it." },
    { title: "Follow-up questions", text: "Talk through time and space complexity and whether there's a better approach." },
    { title: "Spoken feedback", text: "You hear how it went before the session closes." },
];

const CHECKLIST = [
    "Find somewhere quiet",
    "Headphones help the interviewer hear only you",
    "Allow the microphone when your browser asks",
];

export function Setup() {
    usePageTitle("Interview setup");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");

    const [targetRole, setTargetRole] = useState(ROLES[0]!);
    const [githubUrl, setGithubUrl] = useState("");
    const [githubError, setGithubError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        const trimmed = githubUrl.trim();
        if (trimmed && !GITHUB_PROFILE.test(trimmed)) {
            setGithubError("Use your profile link, like https://github.com/your-username.");
            return;
        }
        setGithubError(null);

        setLoading(true);
        try {
            await axios.post(`${BACKEND_URL}/api/pre-interview`, {
                targetRole,
                githubUrl: trimmed || undefined,
            });
            resetInterviewSession(targetRole);
            navigate(`/interview?userId=${userId || ""}`);
        } catch (error: any) {
            toast.error(error.response?.data?.msg || "We couldn't set up your interview. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <AppLayout>
            <div className="app-container grid gap-14 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-24 lg:py-20">
                <section>
                    <p className="label-mono text-muted-foreground">Interview setup</p>
                    <h1 className="text-h2 mt-4">Set up your interview.</h1>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                        Choose the role you're preparing for. Add your GitHub and the interviewer tailors its questions to what you've built.
                    </p>

                    <form onSubmit={handleSubmit} noValidate className="mt-10 grid max-w-md gap-6">
                        <Field label="Target role" htmlFor="role">
                            {(control) => (
                                <Select value={targetRole} onValueChange={setTargetRole}>
                                    <SelectTrigger {...control}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map((role) => (
                                            <SelectItem key={role} value={role}>
                                                {role}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </Field>

                        <Field
                            label="GitHub profile (optional)"
                            htmlFor="github"
                            error={githubError}
                            hint="We read your public repositories to tailor the questions. Leave it blank to skip."
                        >
                            {(control) => (
                                <Input
                                    {...control}
                                    type="text"
                                    name="github"
                                    inputMode="url"
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    placeholder="https://github.com/your-username"
                                    value={githubUrl}
                                    onChange={(event) => {
                                        setGithubUrl(event.target.value);
                                        if (githubError) setGithubError(null);
                                    }}
                                />
                            )}
                        </Field>

                        <Button type="submit" variant="signal" size="lg" disabled={loading} className="group mt-2 w-full sm:w-fit">
                            {loading ? <Spinner /> : null}
                            {loading ? "Preparing your interviewer" : "Start interview"}
                            {!loading && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                        </Button>
                    </form>
                </section>

                <aside className="grid content-start gap-10">
                    <div className="rounded-xl border bg-card p-7">
                        <p className="label-mono text-muted-foreground">What to expect</p>
                        <ol className="mt-6 grid gap-6">
                            {STEPS.map((step, index) => (
                                <li key={step.title} className="grid grid-cols-[1.75rem_1fr] gap-3">
                                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                    <div>
                                        <h2 className="text-[15px] font-medium">{step.title}</h2>
                                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
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
